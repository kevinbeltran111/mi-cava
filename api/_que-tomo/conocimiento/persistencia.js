// =============================================================================
// Etapa 7.3-B: PREPARACIÓN Y SIMULACIÓN de cambios de inferencias en
// user_knowledge. NO ESCRIBE.
// =============================================================================
// ESCRITURA_HABILITADA = false y este módulo no recibe ni usa clientes de
// Supabase: solo calcula qué operaciones harían falta y valida las filas
// contra las restricciones reales de la migración 7.1. Habilitar escrituras
// requiere autorización y la decisión sobre unicidad/concurrencia
// (ver supabase/propuestas/7_3_B_persistencia_inferencias.md).
//
// Alcance de lo que se gestionaría:
//   * solo knowledge_type 'inference' con source_type 'behavior';
//   * nunca toca 'explicit' ni 'restriction' ni otros orígenes;
//   * nunca borra: 7.1 no da DELETE a service_role. Se usan estados:
//       superseded  reemplazada por una versión nueva o sin evidencia vigente
//       revoked     corrección explícita del usuario (prepararRevocacion)
//
// Clave lógica (una inferencia activa por alcance):
//   inference | behavior | scope_type | clave normalizada | wine_id
// La polaridad NO forma parte de la clave: si cambia, la inferencia se
// sustituye. `value` queda null: su contrato no está aprobado, por eso cada
// fila simulada se marca requiereContratoValue = true.
// =============================================================================

import { FORMATO_EVIDENCIA } from "./explicar.js";
import { TIPOS_EVIDENCIA } from "./evidencias.js";

export const ESCRITURA_HABILITADA = false;

const ORIGEN = "behavior";

export function claveLogica({ scopeType, clave, wineId = null }) {
  return ["inference", ORIGEN, scopeType, clave ?? "", wineId ?? ""].join("|");
}

// Evidencia en FORMATO_EVIDENCIA a partir de un grupo agregado.
// Cada referencia guarda cómo estaba clasificado su vino para este alcance
// (rol + clasificación de variedad o bodega). explicar.js lo compara con la
// clasificación actual para saber si la referencia sigue respaldando el
// alcance aunque el puntaje o el favorito no hayan cambiado.
function clasificacionRegistrada(scopeType, rol, vino) {
  if (!vino) return { dimension: scopeType, rol, detalle: null };
  const detalle = scopeType === "grape"
    ? { estado: vino.variedad.estado, ids: [...vino.variedad.ids], varietal: vino.variedad.texto ?? null }
    : { clave: vino.bodega.clave, bodega: vino.bodega.texto };
  return { dimension: scopeType, rol, detalle };
}

function evidenciaDeGrupo(scopeType, grupo, rol, evidenciasPorId, vinos, fuerza, polaridad) {
  const referencias = (grupo.evidencias[rol] || []).map((id) => {
    const e = evidenciasPorId.get(id);
    if (!e) return { tipo: "desconocida", id };
    const clasificacion = clasificacionRegistrada(scopeType, rol, vinos.get(e.wineId));
    if (e.tipo === TIPOS_EVIDENCIA.FAVORITO) return { tipo: "favorito", wineId: e.wineId, clasificacion };
    return { tipo: "consumo", id: e.consumoId, wineId: e.wineId, puntuacion: e.puntuacion, clasificacion };
  });
  return {
    formato: FORMATO_EVIDENCIA,
    agregacion: { dimension: scopeType, clave: grupo.clave, rol },
    referencias,
    indicadores: grupo.bloques[rol],
    regla: { version: fuerza.version, polaridad, condiciones: fuerza[polaridad].condiciones },
  };
}

function firmaReferencias(ev) {
  return JSON.stringify((ev?.referencias || []).map((r) => [r.tipo, r.id ?? r.wineId, r.puntuacion ?? null, r.clasificacion?.rol ?? null]).sort());
}

// Restricciones de 7.1 sobre una fila de user_knowledge (para validar antes
// de cualquier escritura futura).
export function validarFila(f) {
  const errores = [];
  const ESC = new Set(["general", "wine_type", "grape", "winery", "wine"]);
  if (!["explicit", "restriction", "inference"].includes(f.knowledge_type)) errores.push("knowledge_type");
  if (!ESC.has(f.scope_type)) errores.push("scope_type");
  if (!["onboarding", "conversation", "behavior", "recommender"].includes(f.source_type)) errores.push("source_type");
  if (!["active", "superseded", "revoked"].includes(f.status)) errores.push("status");
  if (typeof f.meaning !== "string" || !f.meaning.trim()) errores.push("meaning");
  if (f.strength !== null && !["indication", "relevant", "strong"].includes(f.strength)) errores.push("strength");
  const sv = f.scope_value;
  if (f.scope_type === "general" && sv !== null) errores.push("scope_value");
  if (["grape", "winery"].includes(f.scope_type) && !(typeof sv === "string" && sv.trim())) errores.push("scope_value");
  if (f.scope_type === "wine_type" && !["tinto", "blanco", "rosado", "naranjo", "espumoso"].includes(sv)) errores.push("scope_value");
  if (f.wine_id && f.scope_type !== "wine") errores.push("wine_id");
  if (f.scope_type === "wine" && !(f.wine_snapshot && typeof f.wine_snapshot === "object" && String(f.wine_snapshot.nombre || "").trim())) errores.push("wine_snapshot");
  if (f.scope_type !== "wine" && f.wine_snapshot) errores.push("wine_snapshot");
  if (f.evidence !== null && typeof f.evidence !== "object") errores.push("evidence");
  if (f.knowledge_type === "inference") {
    const vacia = f.evidence === null || (Array.isArray(f.evidence) ? f.evidence.length === 0 : Object.keys(f.evidence).length === 0);
    if (vacia) errores.push("evidence_inference");
  }
  return errores;
}

function filaPropuesta({ userId, scopeType, grupo, rol, polaridad, fuerza, evidenciasPorId, vinos }) {
  const dim = scopeType === "grape" ? "la cepa" : "la bodega";
  const sentido = polaridad === "positiva" ? "afinidad" : "rechazo";
  return {
    user_id: userId,
    knowledge_type: "inference",
    scope_type: scopeType,
    scope_value: grupo.clave,
    wine_id: null,
    wine_snapshot: null,
    meaning: `Indicio de ${sentido} observado con ${dim} ${grupo.etiqueta ?? grupo.clave}${rol === "enCorte" ? " (en cortes)" : ""}`,
    value: null,
    strength: fuerza[polaridad].nivel,
    source_type: ORIGEN,
    evidence: evidenciaDeGrupo(scopeType, grupo, rol, evidenciasPorId, vinos, fuerza, polaridad),
    status: "active",
  };
}

// Calcula el plan de cambios.
//   perfil, extraccion: de construirConocimiento()
//   almacenadas: perfil.inferencias.almacenadas (las activas que leyó 7.3-A)
// Devuelve { estado, operaciones, advertencias }. No ejecuta nada.
export function prepararCambios({ perfil, extraccion }) {
  const userId = perfil.usuarioId;
  const operaciones = [];
  const advertencias = [];
  const evidenciasPorId = new Map(extraccion.evidencias.map((e) => [e.id, e]));

  if (perfil.inferencias.calculadas.reglas.estado !== "aplicadas") {
    return { estado: "sin_regla_validada", escrituraHabilitada: ESCRITURA_HABILITADA, operaciones, advertencias };
  }

  // Inferencias propias (behavior) almacenadas, agrupadas por clave lógica.
  const almacenadas = new Map();
  for (const i of perfil.inferencias.almacenadas) {
    if (i.fuente !== ORIGEN) continue;
    const k = claveLogica({ scopeType: i.alcance.tipo, clave: i.alcance.clave, wineId: i.alcance.tipo === "wine" ? i.alcance.clave : null });
    if (!almacenadas.has(k)) almacenadas.set(k, []);
    almacenadas.get(k).push(i);
  }
  for (const [k, lista] of almacenadas) {
    if (lista.length > 1) advertencias.push({ tipo: "duplicadas_activas", clave: k, ids: lista.map((i) => i.id) });
  }

  // Propuestas desde las agregaciones (solo monovarietal / total: los cortes
  // no generan inferencias hasta que una regla lo decida explícitamente).
  const propuestas = new Map();
  const grupos = [
    ...perfil.inferencias.calculadas.cepas.grupos.map((g) => ["grape", g, "monovarietal"]),
    ...perfil.inferencias.calculadas.bodegas.grupos.map((g) => ["winery", g, "total"]),
  ];
  for (const [scopeType, g, rol] of grupos) {
    const f = g.fuerza;
    if (f.estado !== "evaluada") continue;
    const k = claveLogica({ scopeType, clave: g.clave });
    if (f.mixta) { advertencias.push({ tipo: "senales_mixtas", clave: k }); continue; }
    const polaridad = f.positiva ? "positiva" : f.negativa ? "negativa" : null;
    if (!polaridad) continue;
    propuestas.set(k, filaPropuesta({ userId, scopeType, grupo: g, rol, polaridad, fuerza: f, evidenciasPorId, vinos: extraccion.vinos }));
  }

  const claves = new Set([...propuestas.keys(), ...[...almacenadas.keys()].filter((k) => k.split("|")[2] !== "wine")]);
  for (const k of [...claves].sort()) {
    const nueva = propuestas.get(k) || null;
    const viejas = almacenadas.get(k) || [];
    const vigente = viejas[0] || null;
    if (nueva) {
      const errores = validarFila(nueva);
      if (errores.length) { advertencias.push({ tipo: "fila_invalida", clave: k, errores }); continue; }
    }
    if (nueva && !vigente) {
      operaciones.push({ op: "insertar", clave: k, fila: nueva, requiereContratoValue: true });
    } else if (!nueva && vigente) {
      // Agregación sin nivel o sin evidencia: la inferencia ya no se sostiene.
      for (const v of viejas) operaciones.push({ op: "retirar", clave: k, id: v.id, nuevoEstado: "superseded", motivo: "sin_respaldo_con_reglas_vigentes" });
    } else if (nueva && vigente) {
      const mismaPolaridad = (vigente.evidenciaRegistrada?.regla?.polaridad ?? null) === nueva.evidence.regla.polaridad;
      const mismoNivel = vigente.fuerzaRegistrada === nueva.strength;
      if (mismaPolaridad && mismoNivel) {
        if (firmaReferencias(vigente.evidenciaRegistrada) === firmaReferencias(nueva.evidence)) operaciones.push({ op: "sin_cambios", clave: k, id: vigente.id });
        else operaciones.push({ op: "actualizar", clave: k, id: vigente.id, cambios: { evidence: nueva.evidence }, requiereContratoValue: true });
      } else {
        operaciones.push({ op: "sustituir", clave: k, id: vigente.id, nuevoEstado: "superseded", fila: nueva, requiereContratoValue: true });
      }
      for (const extra of viejas.slice(1)) operaciones.push({ op: "retirar", clave: k, id: extra.id, nuevoEstado: "superseded", motivo: "duplicada" });
    }
  }
  return { estado: "simulacion", escrituraHabilitada: ESCRITURA_HABILITADA, operaciones, advertencias };
}

// Corrección explícita del usuario («eso no es así»): revocar, nunca borrar.
export function prepararRevocacion(inferencia, motivo) {
  if (inferencia?.fuente !== ORIGEN) return { ok: false, error: "Solo se revocan inferencias de comportamiento desde acá." };
  return { ok: true, operacion: { op: "revocar", id: inferencia.id, nuevoEstado: "revoked", motivo: String(motivo || "corrección del usuario").slice(0, 200) }, escrituraHabilitada: ESCRITURA_HABILITADA };
}

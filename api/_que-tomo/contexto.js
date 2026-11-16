// =============================================================================
// Etapa 7.3-A: contexto personal del usuario para «¿Qué tomo?».
// =============================================================================
// Dos partes:
//   1. leerDatosPersonales(): lee con el cliente del USUARIO (su token), así
//      que todo pasa por las policies RLS existentes. Nunca usa service_role
//      (que, además, no tiene SELECT sobre wines / wine_privado / consumos).
//   2. representarContexto(): función pura que convierte las filas en una
//      representación que separa explícitamente:
//        hechos        lo que es verdad sobre la botella (identidad, origen,
//                      stock, precio pagado). No dicen nada sobre el gusto.
//        preferencias  lo declarado por el usuario (onboarding 7.2 y
//                      user_knowledge 'explicit').
//        senales       comportamiento y evaluaciones registradas (favorito,
//                      consumos, puntuaciones), sin convertirlas en agrado.
//        inferencias   user_knowledge 'inference' tal como está, con su
//                      evidencia. Este módulo no crea ninguna.
//        restricciones user_knowledge 'restriction'. No se aplican acá:
//                      7.3-B decide cómo tienen prioridad.
//
// Reglas que este módulo respeta y NO interpreta:
//   * stock > 0 es disponibilidad, no preferencia;
//   * un consumo es un hecho de comportamiento, no satisfacción: sin
//     puntuación, la satisfacción es desconocida (promedio null, nunca 0);
//   * el precio pagado es histórico y no equivale al presupuesto actual;
//   * origen y región se marcan con cautela (vienen de la etiqueta leída
//     por IA o de edición manual, sin verificación);
//   * el maridaje del vino es una sugerencia registrada, no una preferencia.
// No hay ponderaciones, ranking ni aprendizaje.
// =============================================================================

import { clasificarError, fallo } from "./errores.js";

export const VERSION_CONTEXTO = "7.3-A.1";

const TAM_PAGINA = 1000;

const COLUMNAS_PREFERENCIAS = [
  "user_id",
  "onboarding_status",
  "wine_types_answer",
  "preferred_wine_types",
  "exploration_open",
  "preferred_grapes",
  "knowledge_level",
  "updated_at",
].join(",");

const COLUMNAS_CONOCIMIENTO = [
  "id",
  "knowledge_type",
  "scope_type",
  "scope_value",
  "wine_id",
  "wine_snapshot",
  "meaning",
  "value",
  "strength",
  "source_type",
  "evidence",
  "created_at",
  "updated_at",
].join(",");

const COLUMNAS_VINOS = "id,nombre,bodega,varietal,anada,region,lugar,maridaje,created_at";
const COLUMNAS_PRIVADO = "wine_id,precio,stock,favorito";
const COLUMNAS_CONSUMOS = "id,wine_id,fecha,puntuacion,comida,comentario";

// -----------------------------------------------------------------------------
// 1. Lectura (cliente del usuario, RLS)
// -----------------------------------------------------------------------------

// Lee todas las filas paginando (PostgREST limita filas por respuesta).
// `construir` devuelve una consulta nueva con orden estable.
async function leerTodo(construir) {
  const filas = [];
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await construir().range(desde, desde + TAM_PAGINA - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new TypeError("Respuesta inesperada");
    filas.push(...data);
    if (data.length < TAM_PAGINA) return filas;
  }
}

// Devuelve { ok: true, filas } o un fallo. Si cualquier lectura falla, falla
// todo: un contexto parcial podría hacer pasar «no se pudo leer» por «no hay».
export async function leerDatosPersonales(client, userId) {
  if (typeof userId !== "string" || !userId) return fallo("validacion", "Falta el usuario autenticado.");
  try {
    const [pref, conocimiento, vinos, privados, consumos] = await Promise.all([
      client.from("user_preferences").select(COLUMNAS_PREFERENCIAS).eq("user_id", userId).maybeSingle()
        .then(({ data, error }) => { if (error) throw error; return data; }),
      leerTodo(() => client.from("user_knowledge").select(COLUMNAS_CONOCIMIENTO)
        .eq("user_id", userId).eq("status", "active").order("id")),
      leerTodo(() => client.from("wines").select(COLUMNAS_VINOS).eq("user_id", userId).order("id")),
      leerTodo(() => client.from("wine_privado").select(COLUMNAS_PRIVADO).eq("user_id", userId).order("wine_id")),
      leerTodo(() => client.from("consumos").select(COLUMNAS_CONSUMOS).eq("user_id", userId).order("id")),
    ]);
    return { ok: true, filas: { preferencias: pref, conocimiento, vinos, privados, consumos } };
  } catch (e) {
    return clasificarError(e, "No se pudo leer tu información personal.");
  }
}

// -----------------------------------------------------------------------------
// 2. Representación (pura)
// -----------------------------------------------------------------------------

function numeroONull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function textoONull(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function fechaTime(f) {
  const t = Date.parse(f);
  return Number.isNaN(t) ? 0 : t;
}

function representarConocimiento(k) {
  return {
    id: k.id,
    alcance: { tipo: k.scope_type, valor: k.scope_value ?? null, wineId: k.wine_id ?? null, vinoRegistrado: k.wine_snapshot ?? null },
    significado: k.meaning,
    valor: k.value ?? null,
    fuerza: k.strength ?? null,
    fuente: k.source_type,
    evidencia: k.evidence ?? null,
    registradoEn: k.created_at ?? null,
  };
}

function representarPreferencias(f) {
  if (!f) return { registrada: false };
  return {
    registrada: true,
    onboarding: f.onboarding_status,
    tipos: {
      // null = pregunta sin responder; 'no_preference' y 'skipped' NO son
      // «le gusta todo». «Me gusta probar de todo» es `exploracion`.
      respuesta: f.wine_types_answer ?? null,
      elegidos: f.preferred_wine_types || [],
      exploracion: Boolean(f.exploration_open),
    },
    variedades: f.preferred_grapes || [],
    nivel: f.knowledge_level ?? null,
    actualizadoEn: f.updated_at ?? null,
  };
}

// filas = { preferencias, conocimiento, vinos, privados, consumos }
export function representarContexto(filas, userId) {
  const conocimiento = filas.conocimiento || [];
  const porTipo = (t) => conocimiento.filter((k) => k.knowledge_type === t).map(representarConocimiento);

  const privadoPorVino = new Map((filas.privados || []).map((p) => [p.wine_id, p]));
  const consumosPorVino = new Map();
  for (const c of filas.consumos || []) {
    if (!consumosPorVino.has(c.wine_id)) consumosPorVino.set(c.wine_id, []);
    consumosPorVino.get(c.wine_id).push(c);
  }
  const conocimientoPorVino = new Map();
  for (const k of conocimiento) {
    if (k.scope_type === "wine" && k.wine_id) {
      if (!conocimientoPorVino.has(k.wine_id)) conocimientoPorVino.set(k.wine_id, []);
      conocimientoPorVino.get(k.wine_id).push(k.id);
    }
  }

  const biblioteca = [...(filas.vinos || [])]
    // Orden neutral y estable (agregado más reciente primero), sin relación
    // con el gusto.
    .sort((a, b) => fechaTime(b.created_at) - fechaTime(a.created_at) || String(a.id).localeCompare(String(b.id)))
    .map((w) => {
      const priv = privadoPorVino.get(w.id) || null;
      const stock = priv ? Number(priv.stock) || 0 : 0;
      const consumos = [...(consumosPorVino.get(w.id) || [])].sort((a, b) => fechaTime(b.fecha) - fechaTime(a.fecha));
      const puntuados = consumos.filter((c) => numeroONull(c.puntuacion) !== null);
      const suma = puntuados.reduce((s, c) => s + Number(c.puntuacion), 0);
      return {
        id: w.id,
        hechos: {
          identidad: {
            nombre: w.nombre,
            bodega: textoONull(w.bodega),
            varietal: textoONull(w.varietal),
            anada: numeroONull(w.anada),
          },
          // Cautela: dato de etiqueta leída por IA o editado a mano.
          origen: { lugar: textoONull(w.lugar), region: textoONull(w.region), verificado: false },
          disponibilidad: { stock, disponible: stock > 0, registrada: Boolean(priv) },
          // Histórico: no es presupuesto.
          precioPagado: priv && numeroONull(priv.precio) !== null ? { valor: numeroONull(priv.precio), naturaleza: "historico" } : null,
          maridajeSugerido: textoONull(w.maridaje),
          agregadoEn: w.created_at ?? null,
        },
        senales: {
          // Señal explícita positiva marcada por el usuario.
          favorito: Boolean(priv?.favorito),
          consumo: {
            veces: consumos.length,
            ultimaFecha: consumos[0]?.fecha ?? null,
          },
          // Evaluación declarada en experiencias. Mismo cálculo que la
          // biblioteca (promedio de experiencias puntuadas, UX-08). Sin
          // puntuaciones: null (satisfacción desconocida), nunca 0.
          valoracion: {
            puntuadas: puntuados.length,
            sinPuntuar: consumos.length - puntuados.length,
            promedio: puntuados.length ? suma / puntuados.length : null,
          },
          experiencias: consumos.map((c) => ({
            id: c.id,
            fecha: c.fecha ?? null,
            puntuacion: numeroONull(c.puntuacion),
            comida: textoONull(c.comida),
            comentario: textoONull(c.comentario),
          })),
        },
        conocimientoAsociado: conocimientoPorVino.get(w.id) || [],
      };
    });

  return {
    version: VERSION_CONTEXTO,
    usuarioId: userId,
    preferencias: {
      declaradas: representarPreferencias(filas.preferencias),
      explicitas: porTipo("explicit"),
    },
    restricciones: porTipo("restriction"),
    inferencias: porTipo("inference"),
    biblioteca,
  };
}

// Lectura + representación. { ok: true, contexto } | fallo.
export async function construirContexto(client, userId) {
  const r = await leerDatosPersonales(client, userId);
  if (!r.ok) return r;
  return { ok: true, contexto: representarContexto(r.filas, userId) };
}

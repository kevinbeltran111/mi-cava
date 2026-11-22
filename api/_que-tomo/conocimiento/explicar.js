// =============================================================================
// Etapa 7.3-B: reconstrucción de evidencias («¿por qué Mi Cava cree esto?»).
// =============================================================================
// user_knowledge.evidence es jsonb libre (7.1 solo exige objeto o lista, y
// no vacío para inferencias). Se reconocen dos formas:
//
//   FORMATO_EVIDENCIA ('mi-cava/evidencia@1'), el que produce la simulación
//   de persistencia de 7.3-B (persistencia.js):
//     { formato, agregacion: { dimension, clave, rol },
//       referencias: [{ tipo: 'consumo', id, wineId, puntuacion, clasificacion }
//                   | { tipo: 'favorito', wineId, clasificacion }
//                   | { tipo: 'vino', wineId }], ... }
//     `clasificacion.rol` es el rol del vino en el alcance cuando se calculó
//     la inferencia ('monovarietal' | 'enCorte' para cepa, 'total' para
//     bodega).
//   Forma simple por listas de ids (la usan los datos de prueba de 7.3-A):
//     { consumos: [ids], vinos: [ids] }
//     No guarda clasificación: el respaldo ORIGINAL no se puede verificar.
// Cualquier otra forma: 'formato_no_reconocido' (no se interpreta).
//
// Estado de cada referencia, contra los datos actuales del usuario:
//   vigente       existe, coincide y sigue respaldando el alcance
//   modificada    existe pero cambió el dato registrado (p. ej. la puntuación)
//   obsoleta      existe pero ya no respalda (p. ej. dejó de ser favorito)
//   reclasificada existe y el dato no cambió, pero el vino ya no está
//                 clasificado en el alcance como cuando se registró (p. ej.
//                 el varietal pasó de «Malbec» a «Malbec / Shiraz»), o, sin
//                 clasificación registrada, hoy no pertenece al alcance
//   faltante      no está entre los datos del usuario (borrada o ajena; con
//                 RLS no se puede distinguir y no se intenta)
//
// Para inferencias de cepa o bodega, cada referencia trae además
// `respaldoAlcance`:
//   { verificacion: 'coincide' | 'cambio' | 'sin_clasificacion_registrada'
//                   | 'no_aplica', rolRegistrado, rolActual }
// 'sin_clasificacion_registrada' es un LÍMITE: solo se sabe si la referencia
// respalda el alcance hoy, no si lo respaldaba cuando se guardó.
// =============================================================================

import { clasificarVino } from "./evidencias.js";
import { CLASIFICACION, resolverAlcanceVariedad, claveBodega } from "./normalizacion.js";

export const FORMATO_EVIDENCIA = "mi-cava/evidencia@1";

function indice(contexto) {
  const vinos = new Map();
  const consumos = new Map();
  for (const v of contexto?.biblioteca || []) {
    vinos.set(v.id, { favorito: Boolean(v.senales.favorito), nombre: v.hechos.identidad.nombre, clasificacion: clasificarVino(v) });
    for (const e of v.senales.experiencias || []) consumos.set(e.id, { wineId: v.id, puntuacion: e.puntuacion });
  }
  return { vinos, consumos };
}

export function leerReferencias(evidencia) {
  if (evidencia === null || evidencia === undefined) return { formato: "sin_evidencia", referencias: [], agregacion: null };
  if (typeof evidencia === "object" && !Array.isArray(evidencia)) {
    if (evidencia.formato === FORMATO_EVIDENCIA && Array.isArray(evidencia.referencias)) {
      return {
        formato: FORMATO_EVIDENCIA,
        referencias: evidencia.referencias.filter((r) => r && typeof r === "object"),
        agregacion: evidencia.agregacion && typeof evidencia.agregacion === "object" ? evidencia.agregacion : null,
      };
    }
    const refs = [];
    const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []);
    for (const id of ids(evidencia.consumos)) refs.push({ tipo: "consumo", id });
    for (const id of ids(evidencia.vinos)) refs.push({ tipo: "vino", wineId: id });
    if (refs.length) return { formato: "listas_de_ids", referencias: refs, agregacion: null };
  }
  return { formato: "formato_no_reconocido", referencias: [], agregacion: null };
}

// Alcance de cepa o bodega contra el que se verifica el respaldo. Prioriza
// el registrado en la evidencia; si no hay, el del conocimiento.
function alcanceVerificable(item, agregacion) {
  const tipo = agregacion?.dimension ?? item.alcance?.tipo ?? null;
  if (tipo !== "grape" && tipo !== "winery") return null;
  let clave = agregacion?.clave ?? item.alcance?.clave ?? null;
  if (clave === null && item.alcance?.valor) {
    clave = tipo === "grape" ? resolverAlcanceVariedad(item.alcance.valor).id : claveBodega(item.alcance.valor);
  }
  if (!clave) return null;
  return { tipo, clave };
}

// Rol actual de un vino en un alcance de cepa o bodega (null = fuera).
export function rolEnAlcance(alcance, clasificacion) {
  if (!alcance || !clasificacion) return null;
  if (alcance.tipo === "grape") {
    const v = clasificacion.variedad;
    if (v.estado === CLASIFICACION.MONOVARIETAL && v.ids[0] === alcance.clave) return "monovarietal";
    if (v.estado === CLASIFICACION.CORTE && v.ids.includes(alcance.clave)) return "enCorte";
    return null;
  }
  if (alcance.tipo === "winery") return clasificacion.bodega.clave === alcance.clave ? "total" : null;
  return null;
}

function verificarAlcance(ref, wineId, idx, alcance, rolAgregacion) {
  if (!alcance) return { verificacion: "no_aplica" };
  const vino = idx.vinos.get(wineId);
  const rolActual = rolEnAlcance(alcance, vino?.clasificacion);
  const rolRegistrado = ref.clasificacion?.rol ?? rolAgregacion ?? null;
  if (rolRegistrado) {
    return { verificacion: rolActual === rolRegistrado ? "coincide" : "cambio", rolRegistrado, rolActual };
  }
  return { verificacion: "sin_clasificacion_registrada", rolRegistrado: null, rolActual };
}

function resolver(ref, idx, alcance, rolAgregacion) {
  let base;
  let wineId = null;
  if (ref.tipo === "consumo") {
    const c = idx.consumos.get(ref.id);
    if (!c) return { ...ref, estado: "faltante" };
    wineId = c.wineId;
    if (ref.puntuacion !== undefined && ref.puntuacion !== c.puntuacion) {
      base = { ...ref, estado: "modificada", wineId, actual: { puntuacion: c.puntuacion } };
    } else {
      base = { ...ref, estado: "vigente", wineId };
    }
  } else if (ref.tipo === "favorito") {
    const v = idx.vinos.get(ref.wineId);
    if (!v) return { ...ref, estado: "faltante" };
    wineId = ref.wineId;
    base = { ...ref, estado: v.favorito ? "vigente" : "obsoleta" };
  } else if (ref.tipo === "vino") {
    if (!idx.vinos.has(ref.wineId)) return { ...ref, estado: "faltante" };
    wineId = ref.wineId;
    base = { ...ref, estado: "vigente" };
  } else {
    return { ...ref, estado: "tipo_desconocido" };
  }

  const respaldoAlcance = verificarAlcance(ref, wineId, idx, alcance, rolAgregacion);
  const out = { ...base, respaldoAlcance };
  // Una referencia vigente deja de serlo si el vino ya no está en el
  // alcance como cuando se registró (o, sin registro, si hoy no está).
  if (out.estado === "vigente") {
    const fuera = respaldoAlcance.verificacion === "cambio"
      || (respaldoAlcance.verificacion === "sin_clasificacion_registrada" && respaldoAlcance.rolActual === null);
    if (fuera) out.estado = "reclasificada";
  }
  return out;
}

// item: conocimiento de explicito.js (cualquier tipo) o de 7.3-A.
// tipoConocimiento: 'explicit' | 'restriction' | 'inference'
export function reconstruir(item, tipoConocimiento, contexto) {
  const idx = indice(contexto);
  const evidencia = item.evidenciaRegistrada ?? item.evidencia ?? null;
  const { formato, referencias, agregacion } = leerReferencias(evidencia);
  const alcance = tipoConocimiento === "inference" ? alcanceVerificable(item, agregacion) : null;
  const resueltas = referencias.map((r) => resolver(r, idx, alcance, agregacion?.rol ?? null));

  // Vino objetivo (scope 'wine'): wine_id NULL o ausente = vino borrado.
  let vinoObjetivo = null;
  if (item.alcance?.tipo === "wine") {
    const wid = item.alcance.clave ?? item.alcance.wineId ?? null;
    vinoObjetivo = wid && idx.vinos.has(wid)
      ? { estado: "vigente", wineId: wid }
      : { estado: "eliminado", wineId: wid, registrado: item.alcance.vinoRegistrado ?? null };
  }

  let estado;
  if (tipoConocimiento !== "inference" && formato === "sin_evidencia") estado = "declarado_por_usuario";
  else if (formato === "sin_evidencia") estado = "sin_evidencia";
  else if (formato === "formato_no_reconocido") estado = "formato_no_reconocido";
  else if (!resueltas.length) estado = "sin_evidencia";
  else {
    const vigentes = resueltas.filter((r) => r.estado === "vigente").length;
    if (vigentes === resueltas.length) estado = "completa";
    else if (vigentes > 0) estado = "parcial";
    else estado = "sin_respaldo_vigente";
  }

  // Límites explícitos de la reconstrucción.
  const limites = [];
  if (resueltas.some((r) => r.respaldoAlcance?.verificacion === "sin_clasificacion_registrada")) {
    limites.push({
      tipo: "respaldo_original_no_verificable",
      detalle: "La evidencia solo guarda ids: se verifica si hoy respalda el alcance, no si lo respaldaba cuando se registró.",
    });
  }
  if (tipoConocimiento === "inference" && !alcance && ["grape", "winery"].includes(item.alcance?.tipo)) {
    limites.push({ tipo: "alcance_no_verificable", detalle: "El alcance de la inferencia no se pudo normalizar." });
  }

  return {
    id: item.id,
    tipo: tipoConocimiento,
    origen: item.fuente ?? null,
    estado,
    formato,
    alcanceVerificado: alcance,
    referencias: resueltas,
    resumen: {
      vigentes: resueltas.filter((r) => r.estado === "vigente").length,
      modificadas: resueltas.filter((r) => r.estado === "modificada").length,
      obsoletas: resueltas.filter((r) => r.estado === "obsoleta").length,
      reclasificadas: resueltas.filter((r) => r.estado === "reclasificada").length,
      faltantes: resueltas.filter((r) => r.estado === "faltante").length,
    },
    limites,
    vinoObjetivo,
  };
}

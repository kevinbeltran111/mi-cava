// =============================================================================
// Etapa 7.4 — Bloque 2: refinamiento por variedad dentro de la misma consulta.
// =============================================================================
// CONTRATO (lo que enviará la interfaz al elegir «Hoy no quiero Malbec»):
//
//   POST /api/que-tomo
//   Authorization: Bearer <access_token>
//   {
//     "modo": "cellar",
//     "sesionId": "<id de la sesión devuelto por la tanda anterior>",
//     "restriccion": { "alcance": { "tipo": "grape", "valor": "malbec" } }
//   }
//
//   * Una restricción por pedido. `valor` admite el id del catálogo
//     («malbec», «cabernet_franc») o la etiqueta («Malbec», «Cabernet
//     Franc»); se normaliza con normalizarContextoTemporal (7.3-B). Una
//     variedad ambigua («Cabernet») o fuera del catálogo («Shiraz») → 400.
//   * En este bloque solo se admite tipo "grape". Bodega, vino y tipo de vino
//     existen en 7.3-B pero no forman parte de este contrato todavía.
//   * `consulta` con texto sigue rechazándose (refinamiento_no_disponible):
//     el refinamiento es siempre estructurado.
//   * Sin `sesionId` el pedido es una consulta NUEVA, sin filtros.
//
// CONTEXTO DE LA SESIÓN (recommendation_sessions.context):
//   {
//     ...lo que devuelve el motor (entrada: "elegir_de_mi_cava"),
//     tanda:    número de la última tanda generada,
//     revision: contador de escrituras (control de concurrencia),
//     temporal: { restricciones: [{ tipo: "grape", clave: "malbec" }] }
//   }
//   Los filtros son temporales: valen para esta sesión, nunca se escriben en
//   user_knowledge y una consulta nueva empieza sin ellos.
//
// COINCIDENCIAS INCIERTAS (sin cambios respecto de 7.3-B): solo se excluyen
// las coincidencias CONFIRMADAS. Un vino cuya variedad no permite decidir
// (sin varietal → no_evaluable; «Cabernet» frente a Cabernet Franc →
// posible) se conserva. Cada candidato ya trae coincidenciasInciertas
// ({ restriccion: "temporal:n" | id, origen, coincidencia, alcance }) en la
// entrada del motor; una futura interfaz podría recibir ese dato por
// recomendación para marcar «no sabemos si es Malbec». Este bloque no lo
// expone en la respuesta.
// =============================================================================

import { normalizarContextoTemporal } from "./conocimiento/temporal.js";
import { etiquetaDeVariedad } from "./conocimiento/normalizacion.js";
import { fallo } from "./errores.js";

export const TIPOS_REFINAMIENTO = Object.freeze(["grape"]);
export const MAX_INTENTOS_CONCURRENCIA = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// body → { ok, refinamiento: null } (consulta nueva)
//      | { ok, refinamiento: { sesionId, filtro: { tipo, clave } } }
//      | fallo con codigo
export function validarRefinamiento(body) {
  const tieneSesion = body?.sesionId !== undefined && body?.sesionId !== null;
  const tieneRestriccion = body?.restriccion !== undefined && body?.restriccion !== null;
  if (!tieneSesion && !tieneRestriccion) return { ok: true, refinamiento: null };
  if (!tieneSesion) return { ...fallo("validacion", "Para refinar hace falta la consulta anterior."), codigo: "sesion_requerida" };
  if (typeof body.sesionId !== "string" || !UUID.test(body.sesionId)) {
    return { ...fallo("validacion", "Identificador de consulta no válido."), codigo: "sesion_invalida" };
  }
  if (!tieneRestriccion) return { ...fallo("validacion", "Falta qué querés excluir."), codigo: "restriccion_invalida" };
  const r = body.restriccion;
  if (typeof r !== "object" || Array.isArray(r) || !r.alcance || typeof r.alcance !== "object" || !TIPOS_REFINAMIENTO.includes(r.alcance.tipo)) {
    return { ...fallo("validacion", "Por ahora solo se puede excluir una variedad."), codigo: "restriccion_invalida" };
  }
  const t = normalizarContextoTemporal({ restricciones: [{ alcance: { tipo: r.alcance.tipo, valor: r.alcance.valor } }] });
  if (!t.ok) return { ...fallo("validacion", "No reconocemos esa variedad.", t.errores), codigo: "restriccion_invalida" };
  const { alcance } = t.temporal.restricciones[0];
  return { ok: true, refinamiento: { sesionId: body.sesionId.toLowerCase(), filtro: { tipo: alcance.tipo, clave: alcance.clave } } };
}

// Filtros guardados en el contexto de la sesión. Un contexto sin filtros
// (o creado antes de 7.4-B2) equivale a lista vacía.
export function filtrosDeSesion(contexto) {
  const lista = contexto?.temporal?.restricciones;
  return Array.isArray(lista) ? lista.filter((f) => f && TIPOS_REFINAMIENTO.includes(f.tipo) && typeof f.clave === "string") : [];
}

// Acumula sin duplicar (por tipo + clave), conservando el orden de llegada.
export function acumularFiltro(filtros, nuevo) {
  return filtros.some((f) => f.tipo === nuevo.tipo && f.clave === nuevo.clave) ? [...filtros] : [...filtros, nuevo];
}

// Entrada para seleccionarParaConsulta (forma de normalizarContextoTemporal).
export function temporalDeFiltros(filtros) {
  return { restricciones: filtros.map((f) => ({ alcance: { tipo: f.tipo, valor: f.clave } })) };
}

export function contextoDeSesion(base, { tanda, revision, filtros }) {
  return { ...(base || {}), tanda, revision, temporal: { restricciones: filtros.map((f) => ({ tipo: f.tipo, clave: f.clave })) } };
}

// Para la respuesta: lo aplicado, legible.
export function describirFiltros(filtros) {
  return filtros.map((f) => ({ tipo: f.tipo, clave: f.clave, etiqueta: f.tipo === "grape" ? etiquetaDeVariedad(f.clave) ?? f.clave : f.clave }));
}

export function revisionDe(contexto) {
  const r = contexto?.revision;
  return Number.isInteger(r) && r >= 0 ? r : null;
}

// =============================================================================
// Etapa 7.3-B: contexto TEMPORAL de una consulta.
// =============================================================================
// Lo que vale solo para esta consulta («hoy no quiero Malbec», la comida de
// hoy, el presupuesto de hoy). Nunca se escribe en user_knowledge; su único
// destino posible es recommendation_sessions.context (7.3-A, sesiones.js).
//
// Entrada estructurada (7.3-B no interpreta texto libre; clasificar la
// consulta escrita corresponde al recomendador):
//   {
//     restricciones: [{ alcance: { tipo: 'grape'|'winery'|'wine'|'wine_type',
//                                  valor?, wineId? }, texto? }],
//     comida:        string opcional,
//     presupuesto:   { min?, max?, moneda? } opcional. Es el presupuesto de
//                    HOY: el precio pagado históricamente no lo reemplaza.
//   }
// =============================================================================

import { normalizarAlcance } from "./explicito.js";

const TIPOS_TEMPORALES = new Set(["grape", "winery", "wine", "wine_type"]);
// Mismos valores que el CHECK de 7.1 sobre wine_type.
const TIPOS_VINO = new Set(["tinto", "blanco", "rosado", "naranjo", "espumoso"]);
const MAX_TEXTO = 200;

export function normalizarContextoTemporal(entrada = {}) {
  const errores = [];
  const restricciones = [];
  const lista = entrada?.restricciones;
  if (lista !== undefined && lista !== null && !Array.isArray(lista)) {
    errores.push("Las restricciones temporales deben ser una lista.");
  }
  for (const [i, r] of (Array.isArray(lista) ? lista : []).entries()) {
    const n = i + 1;
    const a = r?.alcance;
    if (!r || typeof r !== "object" || !a || typeof a !== "object" || Array.isArray(a)) {
      errores.push(`Restricción temporal ${n}: entrada sin alcance.`);
      continue;
    }
    if (!TIPOS_TEMPORALES.has(a.tipo)) { errores.push(`Restricción temporal ${n}: tipo de alcance no válido.`); continue; }
    if (r.texto !== undefined && r.texto !== null && typeof r.texto !== "string") {
      errores.push(`Restricción temporal ${n}: el texto debe ser texto.`);
      continue;
    }
    // Cada alcance debe resolverse a una clave inequívoca. Una cepa ausente,
    // ambigua («Cabernet»), con texto adicional o fuera del catálogo
    // («Shiraz») se rechaza: no se adivina qué quiso excluir el usuario.
    if (a.tipo === "wine") {
      if (typeof a.wineId !== "string" || !a.wineId.trim()) { errores.push(`Restricción temporal ${n}: falta el vino.`); continue; }
    } else if (a.tipo === "wine_type") {
      if (!TIPOS_VINO.has(a.valor)) { errores.push(`Restricción temporal ${n}: tipo de vino no válido.`); continue; }
    } else if (typeof a.valor !== "string" || !a.valor.trim()) {
      errores.push(`Restricción temporal ${n}: falta el valor del alcance.`);
      continue;
    }
    const alcance = normalizarAlcance({ tipo: a.tipo, valor: a.valor ?? null, wineId: a.wineId ?? null });
    if (!alcance.normalizado || !alcance.clave) {
      errores.push(`Restricción temporal ${n}: ${a.tipo === "grape" ? `variedad no resoluble (${alcance.estadoNormalizacion})` : "alcance no resoluble"}.`);
      continue;
    }
    restricciones.push({
      alcance,
      texto: typeof r.texto === "string" ? r.texto.slice(0, MAX_TEXTO) : null,
      persistente: false, // nunca se guarda como conocimiento del usuario
    });
  }

  let comida = null;
  if (entrada?.comida !== undefined && entrada?.comida !== null) {
    if (typeof entrada.comida !== "string") errores.push("La comida debe ser texto.");
    else comida = entrada.comida.trim().slice(0, MAX_TEXTO) || null;
  }

  let presupuesto = null;
  if (entrada?.presupuesto) {
    const { min = null, max = null, moneda = null } = entrada.presupuesto;
    const num = (v) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
    if (!num(min) || !num(max) || (min !== null && max !== null && min > max)) errores.push("Presupuesto no válido.");
    else if (moneda !== null && !/^[A-Z]{3}$/.test(moneda)) errores.push("Moneda no válida.");
    else presupuesto = { min, max, moneda, origen: "consulta" };
  }

  return { ok: errores.length === 0, errores, temporal: { restricciones, comida, presupuesto } };
}

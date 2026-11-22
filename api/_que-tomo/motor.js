// =============================================================================
// Etapa 7.3-A: contrato del motor de recomendación (lo implementa 7.3-B).
// =============================================================================
// HISTÓRICO (7.3-A): no había motor; MOTOR_ACTUAL era null y el endpoint
// respondía 501 { codigo: "motor_pendiente" }. Desde 7.4-B1 el motor vigente
// es motorCellar y la entrada cambió (ver el bloque 7.4 más abajo); lo que
// sigue describe el contrato ORIGINAL, cuya SalidaMotor no cambió.
//
// PUNTO DE INTEGRACIÓN 7.3-B: reemplazar MOTOR_ACTUAL por una función
//
//   async motor({ consulta, contexto, candidatos }) => SalidaMotor
//
//   consulta    texto del usuario, ya validado (string, 1..MAX_CONSULTA)
//   contexto    representación de contexto.js (preferencias, restricciones,
//               inferencias, biblioteca con hechos y señales)
//   candidatos  salida de candidatos.js (biblioteca completa, orden neutral)
//
// Corresponde a 7.3-B, y no a este archivo: clasificar la consulta, aplicar
// restricciones, elegir y ordenar, decidir qué datos personales recibe la IA
// y redactar explicaciones.
//
// SalidaMotor (validada por validarSalidaMotor antes de guardar nada):
//   {
//     modo:          'food' | 'cellar'      ('discovery' = vinos nuevos,
//                                             fuera del alcance de 7.3)
//     suficiencia:   'insufficient' | 'partial' | 'sufficient' | null
//     contextoSesion: objeto con el contexto TEMPORAL de la consulta
//                    (p. ej. la comida). Se guarda en
//                    recommendation_sessions.context. No copiar acá datos
//                    de la biblioteca.
//     engineVersion: string | null
//     model:         string | null
//     recomendaciones: [  // 0 a 3
//       {
//         wineId:       id de un candidato (obligatorio: nada fuera de la
//                       biblioteca)
//         relationship: 'owned' | 'known'   (mapeo pendiente de 7.3-B)
//         explicacion:  texto no vacío para el usuario
//         signals:      objeto | array (opcional) → items.signals
//         grounding:    objeto | array (opcional) → items.grounding
//       }
//     ]
//   }
// =============================================================================

// -----------------------------------------------------------------------------
// 7.4 — Bloque 1: el motor vigente es motorCellar (motor_cellar.js), solo
// para modo 'cellar' («Elegir de mi cava»). La entrada ya NO incluye la
// biblioteca completa ni el contexto: el endpoint la arma con
// prepararCellar() y el motor recibe
//
//   { modo: 'cellar', consulta, candidatos, preferencias: { variedadesDeclaradas } }
//
//   candidatos  solo vinos propios con stock que superan las restricciones
//               confirmadas (misma forma que candidatos.js + variedad)
//
// La salida se valida con validarSalidaMotor contra esos mismos candidatos.
// -----------------------------------------------------------------------------

import { fallo } from "./errores.js";
import { motorCellar } from "./motor_cellar.js";

export const MOTOR_ACTUAL = motorCellar;

export const MODOS_PERMITIDOS = Object.freeze(["food", "cellar"]);
export const SUFICIENCIAS = Object.freeze(["insufficient", "partial", "sufficient"]);
export const RELACIONES_PERMITIDAS = Object.freeze(["owned", "known"]);
export const MAX_RECOMENDACIONES = 3;
export const MAX_EXPLICACION = 2000;

const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esJsonEstructurado = (v) => v !== null && typeof v === "object";
const textoOpcional = (v) => v === undefined || v === null || (typeof v === "string" && v.length <= 200);

// Devuelve { ok: true, valor } con la salida normalizada (identidad tomada de
// los candidatos) o un fallo 'validacion' indicando qué incumple.
export function validarSalidaMotor(salida, candidatos) {
  if (!esObjeto(salida)) return fallo("validacion", "El motor no devolvió un objeto.");
  if (!MODOS_PERMITIDOS.includes(salida.modo)) return fallo("validacion", `Modo no permitido: ${salida.modo}.`);
  const suficiencia = salida.suficiencia ?? null;
  if (suficiencia !== null && !SUFICIENCIAS.includes(suficiencia)) return fallo("validacion", "Suficiencia de contexto no válida.");
  const contextoSesion = salida.contextoSesion ?? {};
  if (!esObjeto(contextoSesion)) return fallo("validacion", "contextoSesion debe ser un objeto.");
  if (!textoOpcional(salida.engineVersion) || !textoOpcional(salida.model)) return fallo("validacion", "engineVersion / model no válidos.");
  if (!Array.isArray(salida.recomendaciones)) return fallo("validacion", "Faltan las recomendaciones (puede ser una lista vacía).");
  if (salida.recomendaciones.length > MAX_RECOMENDACIONES) return fallo("validacion", `Más de ${MAX_RECOMENDACIONES} recomendaciones.`);

  const porId = new Map((candidatos || []).map((c) => [c.wineId, c]));
  const vistos = new Set();
  const recomendaciones = [];
  for (const [i, r] of salida.recomendaciones.entries()) {
    if (!esObjeto(r)) return fallo("validacion", `Recomendación ${i + 1} no válida.`);
    const cand = porId.get(r.wineId);
    // Sin candidato = botella inventada o ajena: se rechaza toda la salida.
    if (!cand) return fallo("validacion", `La recomendación ${i + 1} no corresponde a un vino de tu biblioteca.`);
    if (!cand.persistible) return fallo("validacion", `El vino de la recomendación ${i + 1} no tiene nombre registrado.`);
    if (vistos.has(r.wineId)) return fallo("validacion", "Vino recomendado más de una vez.");
    vistos.add(r.wineId);
    if (!RELACIONES_PERMITIDAS.includes(r.relationship)) return fallo("validacion", `Relación no permitida: ${r.relationship}.`);
    if (typeof r.explicacion !== "string" || !r.explicacion.trim() || r.explicacion.length > MAX_EXPLICACION) {
      return fallo("validacion", `La recomendación ${i + 1} no tiene una explicación válida.`);
    }
    if (r.signals !== undefined && !esJsonEstructurado(r.signals)) return fallo("validacion", "signals debe ser objeto o lista.");
    if (r.grounding !== undefined && r.grounding !== null && !esJsonEstructurado(r.grounding)) return fallo("validacion", "grounding debe ser objeto o lista.");
    recomendaciones.push({
      posicion: i + 1,
      candidato: cand,
      relationship: r.relationship,
      explicacion: r.explicacion.trim(),
      signals: r.signals ?? {},
      grounding: r.grounding ?? null,
    });
  }

  return {
    ok: true,
    valor: {
      modo: salida.modo,
      suficiencia,
      contextoSesion,
      engineVersion: salida.engineVersion ?? null,
      model: salida.model ?? null,
      recomendaciones,
    },
  };
}

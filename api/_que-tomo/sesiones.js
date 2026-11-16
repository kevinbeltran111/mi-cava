// =============================================================================
// Etapa 7.3-A: persistencia en recommendation_sessions / recommendation_items.
// =============================================================================
// Usa el cliente service_role (solo servidor), que es el único rol con
// INSERT / UPDATE en estas tablas (migración 20261025000000). El usuario las
// lee después por RLS. No se escribe user_knowledge ni recommendation_events.
//
// Garantías:
//   * user_id de la sesión = usuario autenticado (lo pasa el endpoint desde
//     el token, nunca desde el cuerpo de la solicitud);
//   * cada item referencia un vino de la biblioteca (wine_id) y su
//     wine_identity se arma desde la base (candidatos.js), no desde el motor;
//   * además, el trigger intel_check_wine_owner de 7.1 rechaza en la base
//     cualquier wine_id ajeno o inexistente.
// =============================================================================

import { clasificarError } from "./errores.js";

// Valor especial de timestamptz: la hora la fija PostgreSQL (igual criterio
// que preferencias.js).
const AHORA_EN_SERVIDOR = "now";

export async function crearSesion(admin, { userId, modo, consulta, contextoSesion, suficiencia, engineVersion, model }) {
  try {
    const { data, error } = await admin
      .from("recommendation_sessions")
      .insert({
        user_id: userId,
        mode: modo,
        status: "active",
        initial_input: consulta,
        context: contextoSesion ?? {},
        context_sufficiency: suficiencia ?? null,
        engine_version: engineVersion ?? null,
        model: model ?? null,
      })
      .select("id,user_id,mode,status,started_at")
      .single();
    if (error) return clasificarError(error, "No se pudo registrar la consulta.");
    return { ok: true, sesion: data };
  } catch (e) {
    return clasificarError(e, "No se pudo registrar la consulta.");
  }
}

// recomendaciones: salida normalizada de validarSalidaMotor().recomendaciones
export async function registrarItems(admin, sessionId, recomendaciones, batchNo = 1) {
  if (!recomendaciones.length) return { ok: true, items: [] };
  const filas = recomendaciones.map((r) => ({
    session_id: sessionId,
    batch_no: batchNo,
    position: r.posicion,
    relationship: r.relationship,
    wine_id: r.candidato.wineId,
    wine_identity: r.candidato.identidad,
    signals: r.signals ?? {},
    grounding: r.grounding ?? null,
  }));
  try {
    const { data, error } = await admin
      .from("recommendation_items")
      .insert(filas)
      .select("id,position,wine_id,relationship");
    if (error) return clasificarError(error, "No se pudieron registrar las recomendaciones.");
    return { ok: true, items: [...data].sort((a, b) => a.position - b.position) };
  } catch (e) {
    return clasificarError(e, "No se pudieron registrar las recomendaciones.");
  }
}

// estado: 'completed' | 'abandoned' | 'error'. Solo cierra sesiones activas.
export async function cerrarSesion(admin, sessionId, estado) {
  try {
    const { data, error } = await admin
      .from("recommendation_sessions")
      .update({ status: estado, ended_at: AHORA_EN_SERVIDOR })
      .eq("id", sessionId)
      .eq("status", "active")
      .select("id,status");
    if (error) return clasificarError(error, "No se pudo cerrar la sesión.");
    return { ok: true, cerrada: Array.isArray(data) && data.length === 1 };
  } catch (e) {
    return clasificarError(e, "No se pudo cerrar la sesión.");
  }
}

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

// -----------------------------------------------------------------------------
// 7.4-B2: refinamiento dentro de la misma sesión.
// -----------------------------------------------------------------------------

// Lee una sesión con el cliente DEL USUARIO (RLS: solo ve las propias). Una
// sesión ajena e inexistente dan el mismo resultado (sesion: null), para no
// revelar que existe. El endpoint compara además user_id con el del token.
export async function leerSesion(cliente, sesionId) {
  try {
    const { data, error } = await cliente
      .from("recommendation_sessions")
      .select("id,user_id,mode,status,context")
      .eq("id", sesionId)
      .maybeSingle();
    if (error) return clasificarError(error, "No se pudo leer la consulta.");
    return { ok: true, sesion: data ?? null };
  } catch (e) {
    return clasificarError(e, "No se pudo leer la consulta.");
  }
}

// Escritura condicionada (control optimista de concurrencia, sin migración):
// actualiza `context` SOLO si la sesión sigue siendo del usuario, sigue
// activa y su context.revision es la que se leyó. PostgreSQL evalúa el WHERE
// sobre la versión vigente de la fila, así que de dos escrituras simultáneas
// con la misma revisión gana una y la otra no actualiza ninguna fila
// (actualizada: false) y debe releer y reintentar.
// revisionEsperada null = sesión sin contador (creada antes de 7.4-B2).
export async function actualizarContextoSesion(admin, { sesionId, userId, revisionEsperada, contexto }) {
  try {
    let q = admin
      .from("recommendation_sessions")
      .update({ context: contexto })
      .eq("id", sesionId)
      .eq("user_id", userId)
      .eq("status", "active");
    q = revisionEsperada === null
      ? q.is("context->>revision", null)
      : q.eq("context->>revision", String(revisionEsperada));
    const { data, error } = await q.select("id,context");
    if (error) return clasificarError(error, "No se pudo actualizar la consulta.");
    return { ok: true, actualizada: Array.isArray(data) && data.length === 1 };
  } catch (e) {
    return clasificarError(e, "No se pudo actualizar la consulta.");
  }
}

// -----------------------------------------------------------------------------
// 7.4-B3: ítems y reservas «para una ocasión especial».
// Escrituras SOLO de la reserva explícita (conocimiento/reserva.js); nunca
// inferencias ni eventos.
// -----------------------------------------------------------------------------

// Ítem recomendado, leído con el cliente DEL USUARIO (RLS: solo ítems de
// sesiones propias). Ajeno e inexistente dan item: null.
export async function leerItem(cliente, itemId) {
  try {
    const { data, error } = await cliente
      .from("recommendation_items")
      .select("id,session_id,batch_no,position,wine_id,relationship")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return clasificarError(error, "No se pudo leer la recomendación.");
    return { ok: true, item: data ?? null };
  } catch (e) {
    return clasificarError(e, "No se pudo leer la recomendación.");
  }
}

// ¿El vino existe y es del usuario? Cliente DEL USUARIO y, además del RLS de
// wines, filtro explícito por user_id (no se asume la política de lectura).
export async function vinoPropio(cliente, { wineId, userId }) {
  try {
    const { data, error } = await cliente.from("wines").select("id").eq("id", wineId).eq("user_id", userId).maybeSingle();
    if (error) return clasificarError(error, "No se pudo verificar el vino.");
    return { ok: true, visible: Boolean(data) };
  } catch (e) {
    return clasificarError(e, "No se pudo verificar el vino.");
  }
}

export async function leerReserva(admin, { id, userId }) {
  try {
    const { data, error } = await admin
      .from("user_knowledge")
      .select("id,status,wine_id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return clasificarError(error, "No se pudo leer la reserva.");
    return { ok: true, reserva: data ?? null };
  } catch (e) {
    return clasificarError(e, "No se pudo leer la reserva.");
  }
}

// Upsert sobre la clave primaria determinista (reserva.js → idReserva):
// crea la fila o reactiva la existente. Nunca deja dos filas por vino.
export async function guardarReserva(admin, fila) {
  try {
    const { data, error } = await admin
      .from("user_knowledge")
      .upsert(fila, { onConflict: "id" })
      .select("id,status,wine_id");
    if (error) return clasificarError(error, "No se pudo guardar la reserva.");
    const r = Array.isArray(data) ? data[0] : data;
    if (!r || r.status !== "active") return clasificarError({ code: "PGRST000" }, "No se pudo guardar la reserva.");
    return { ok: true, reserva: r };
  } catch (e) {
    return clasificarError(e, "No se pudo guardar la reserva.");
  }
}

// Revoca SOLO reservas activas de ese vino y ese usuario (marca en value).
export async function revocarReserva(admin, { userId, wineId, marca }) {
  try {
    const { data, error } = await admin
      .from("user_knowledge")
      .update({ status: "revoked" })
      .eq("user_id", userId)
      .eq("wine_id", wineId)
      .eq("knowledge_type", "explicit")
      .eq("scope_type", "wine")
      .eq("status", "active")
      .eq("value->>marca", marca.marca)
      .eq("value->>version", String(marca.version))
      .select("id");
    if (error) return clasificarError(error, "No se pudo quitar la reserva.");
    return { ok: true, revocadas: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return clasificarError(e, "No se pudo quitar la reserva.");
  }
}

// -----------------------------------------------------------------------------
// 7.4-B4: medición (eventos.js).
// -----------------------------------------------------------------------------

// Ítems de una sesión, con el cliente DEL USUARIO (RLS).
export async function leerItemsDeSesion(cliente, sesionId) {
  try {
    const { data, error } = await cliente
      .from("recommendation_items")
      .select("id,session_id,batch_no,position,wine_id")
      .eq("session_id", sesionId);
    if (error) return clasificarError(error, "No se pudieron leer las recomendaciones.");
    return { ok: true, items: data || [] };
  } catch (e) {
    return clasificarError(e, "No se pudieron leer las recomendaciones.");
  }
}

// Consumo propio (cliente del usuario + filtro explícito por user_id).
export async function leerConsumoPropio(cliente, { consumoId, userId }) {
  try {
    const { data, error } = await cliente.from("consumos").select("id,wine_id").eq("id", consumoId).eq("user_id", userId).maybeSingle();
    if (error) return clasificarError(error, "No se pudo verificar la apertura.");
    return { ok: true, consumo: data ?? null };
  } catch (e) {
    return clasificarError(e, "No se pudo verificar la apertura.");
  }
}

// INSERT ... ON CONFLICT (id) DO NOTHING (la tabla es append-only: nunca
// UPDATE). Devuelve cuántas filas eran nuevas.
export async function insertarEventos(admin, filas) {
  try {
    const { data, error } = await admin
      .from("recommendation_events")
      .upsert(filas, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) return clasificarError(error, "No se pudo registrar el evento.");
    return { ok: true, nuevos: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    return clasificarError(e, "No se pudo registrar el evento.");
  }
}

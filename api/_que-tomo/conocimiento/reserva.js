// =============================================================================
// Etapa 7.4 — Bloque 3: reserva «Guardar para una ocasión especial».
// =============================================================================
// Se guarda en user_knowledge, reutilizando el modelo de 7.1:
//   knowledge_type 'explicit', scope_type 'wine', wine_id, wine_snapshot,
//   source_type 'recommender', strength null, status active | revoked.
//
// MARCA en `value` (lo único que lee el selector; `meaning` es solo texto
// para personas y nunca se interpreta):
//
//   { "marca": "reserva", "motivo": "ocasion_especial", "version": 1 }
//
// UNA RESERVA POR USUARIO Y VINO, SIN MIGRACIÓN: el id de la fila no es
// aleatorio, se deriva de (user_id, wine_id) con un UUID v5 propio de Mi
// Cava. Reservar es un upsert sobre la clave primaria: dos pedidos
// simultáneos o un doble toque caen sobre la MISMA fila (PostgreSQL
// resuelve el ON CONFLICT de forma atómica), así que nunca hay dos filas de
// reserva —ni activas ni revocadas— para el mismo vino. Quitar la reserva
// la pasa a 'revoked'; volver a reservar la reactiva (status 'active').
// Límite conocido: no queda un historial de ciclos reserva/quitar; la fila
// conserva created_at del primer alta y updated_at de la última acción.
// =============================================================================

import { uuidV5 } from "../uuid5.js";

export const MARCA_RESERVA = Object.freeze({ marca: "reserva", motivo: "ocasion_especial", version: 1 });
export const SIGNIFICADO_RESERVA = "Reservado para una ocasión especial";
export const FUENTE_RESERVA = "recommender";

// Espacio de nombres UUID propio (fijo) para las reservas de Mi Cava.
const ESPACIO_RESERVAS = "6f1c2b0e-7a4d-5e3f-9b8a-4c2d1e0f7a74";

export function esReserva(valor) {
  return Boolean(
    valor && typeof valor === "object" && !Array.isArray(valor) &&
    valor.marca === MARCA_RESERVA.marca && valor.version === MARCA_RESERVA.version
  );
}

// UUID v5 de `${userId}:${wineId}:reserva` en el espacio de reservas.
export function idReserva(userId, wineId) {
  return uuidV5(ESPACIO_RESERVAS, `${String(userId).toLowerCase()}:${String(wineId).toLowerCase()}:reserva`);
}

// Fila completa para el upsert. evidence registra desde dónde se reservó.
export function filaReserva({ userId, wineId, identidad, evidencia }) {
  return {
    id: idReserva(userId, wineId),
    user_id: userId,
    knowledge_type: "explicit",
    scope_type: "wine",
    scope_value: null,
    wine_id: wineId,
    wine_snapshot: identidad,
    meaning: SIGNIFICADO_RESERVA,
    value: { ...MARCA_RESERVA },
    strength: null,
    source_type: FUENTE_RESERVA,
    evidence: evidencia ?? null,
    status: "active",
  };
}

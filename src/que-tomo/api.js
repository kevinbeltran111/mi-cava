// =============================================================================
// Etapa 7.4-B4: cliente de /api/que-tomo para «Elegir de mi cava».
// =============================================================================
// Todas las funciones devuelven { status, cuerpo } y nunca lanzan: un error
// de red se informa como { status: 0, cuerpo: null }.
// =============================================================================

const RUTA = "/api/que-tomo";

export async function llamarQueTomo(accessToken, body, { fetchImpl = fetch } = {}) {
  try {
    const r = await fetchImpl(RUTA, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { cuerpo = null; }
    return { status: r.status, cuerpo };
  } catch {
    return { status: 0, cuerpo: null };
  }
}

export const pedirPrimeraTanda = (token, o) => llamarQueTomo(token, { modo: "cellar" }, o);

export const refinarPorVariedad = (token, sesionId, variedadId, o) =>
  llamarQueTomo(token, { modo: "cellar", sesionId, restriccion: { alcance: { tipo: "grape", valor: variedadId } } }, o);

export const reservarVino = (token, sesionId, itemId, o) =>
  llamarQueTomo(token, { accion: "reservar", modo: "cellar", sesionId, itemId }, o);

export const quitarReserva = (token, wineId, o) => llamarQueTomo(token, { accion: "quitar_reserva", wineId }, o);

// Medición: no se espera ni se informa nada a la persona. Si falla, la
// recomendación y la apertura siguen igual.
export function registrarEvento(token, evento, o) {
  return llamarQueTomo(token, { accion: "evento", ...evento }, o).catch(() => ({ status: 0, cuerpo: null }));
}

// Estado persistido de la reserva de un vino (lectura con RLS del usuario).
// → { ok: true, reservado: boolean } | { ok: false }
export async function leerReservaDeVino(client, { userId, wineId }) {
  try {
    const { data, error } = await client
      .from("user_knowledge")
      .select("id")
      .eq("user_id", userId)
      .eq("wine_id", wineId)
      .eq("knowledge_type", "explicit")
      .eq("scope_type", "wine")
      .eq("status", "active")
      .eq("value->>marca", "reserva");
    if (error) return { ok: false };
    return { ok: true, reservado: (data || []).length > 0 };
  } catch {
    return { ok: false };
  }
}

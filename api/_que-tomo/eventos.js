// =============================================================================
// Etapa 7.4 — Bloque 4: medición de beta en recommendation_events.
// =============================================================================
// POST /api/que-tomo { accion: "evento", sesionId, tipo, ... }. La interfaz
// lo llama sin esperar su resultado: una falla de medición nunca interrumpe
// la recomendación ni la apertura.
//
//   tipo           cuerpo                          cuándo lo envía la pantalla
//   shown          itemIds: [1..3 ids de la tanda]  la tanda quedó visible
//   selected       itemId                           tocó «Abrir esta botella»
//   bottle_opened  itemId, consumoId                el flujo de apertura existente
//                                                   confirmó (registrar_consumo)
//   new_batch      tanda | null, origen, filtros,   llegó la respuesta de un
//                  resultado, motivo               refinamiento o de una reserva
//
// Cancelar el diálogo de apertura no envía nada: queda `selected` sin
// `bottle_opened` (elección sin apertura confirmada).
//
// SIN DUPLICADOS: el id de cada evento es un UUID v5 de su identidad lógica
// y se inserta con ON CONFLICT (id) DO NOTHING (nunca UPDATE: la tabla es
// append-only por trigger). Renderizados repetidos, reintentos o dobles
// toques caen sobre el mismo id.
//   shown / selected   (sesión, ítem, tipo)       una vez por ítem
//   bottle_opened      (sesión, ítem, consumo)    una vez por botella abierta
//   new_batch          (sesión, tanda) o, sin tanda, (sesión, filtros, motivo)
//
// PERTENENCIA (verificada en el servidor, nunca desde el cuerpo): la sesión
// se lee con el token del usuario (RLS) y se compara user_id; cada ítem debe
// ser de esa sesión; el consumo de bottle_opened debe ser del usuario y del
// mismo vino que el ítem; la tanda de new_batch debe existir en la sesión y
// sus filtros deben estar en el contexto de la sesión.
// =============================================================================

import { uuidV5 } from "./uuid5.js";

export const TIPOS_EVENTO = Object.freeze(["shown", "selected", "bottle_opened", "new_batch"]);
export const ORIGENES_TANDA = Object.freeze(["refinamiento", "reserva"]);
export const MOTIVOS_SIN_CANDIDATOS = Object.freeze([
  "sin_stock", "excluidos_por_restriccion", "excluidos_por_filtro", "excluidos_por_reserva",
]);
const ESPACIO_EVENTOS = "8b0e3c52-2d61-5f4a-a7c9-3e5d7a1b9c74";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (x) => typeof x === "string" && UUID.test(x);
const CLAVE = /^[a-z][a-z0-9_]{0,40}$/;

const fallo = (codigo, mensaje) => ({ ok: false, codigo, mensaje });

// body → { ok, evento: { sesionId, tipo, itemIds, consumoId, tanda, payloadNewBatch } } | fallo
export function validarEvento(body) {
  if (!esUuid(body?.sesionId)) return fallo("sesion_invalida", "Identificador de consulta no válido.");
  const tipo = body?.tipo;
  if (!TIPOS_EVENTO.includes(tipo)) return fallo("evento_invalido", "Tipo de evento no válido.");
  const base = { sesionId: body.sesionId.toLowerCase(), tipo, itemIds: [], consumoId: null, tanda: null, nuevaTanda: null };

  if (tipo === "shown") {
    const ids = body.itemIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || !ids.every(esUuid)) return fallo("item_invalido", "La tanda mostrada no es válida.");
    const unicos = [...new Set(ids.map((x) => x.toLowerCase()))];
    if (unicos.length !== ids.length) return fallo("item_invalido", "La tanda mostrada repite recomendaciones.");
    return { ok: true, evento: { ...base, itemIds: unicos } };
  }
  if (tipo === "selected" || tipo === "bottle_opened") {
    if (!esUuid(body.itemId)) return fallo("item_invalido", "Identificador de recomendación no válido.");
    if (tipo === "bottle_opened" && !esUuid(body.consumoId)) return fallo("consumo_invalido", "Falta la apertura confirmada.");
    return { ok: true, evento: { ...base, itemIds: [body.itemId.toLowerCase()], consumoId: tipo === "bottle_opened" ? body.consumoId.toLowerCase() : null } };
  }
  // new_batch
  const { tanda = null, origen, filtros = [], resultado, motivo = null } = body;
  if (!ORIGENES_TANDA.includes(origen)) return fallo("evento_invalido", "Origen de la tanda no válido.");
  if (!Array.isArray(filtros) || filtros.length > 30 || !filtros.every((f) => typeof f === "string" && CLAVE.test(f))) {
    return fallo("evento_invalido", "Filtros no válidos.");
  }
  if (resultado === "ok") {
    if (!Number.isInteger(tanda) || tanda < 2 || motivo !== null) return fallo("evento_invalido", "Tanda no válida.");
  } else if (resultado === "sin_candidatos") {
    if (tanda !== null || !MOTIVOS_SIN_CANDIDATOS.includes(motivo)) return fallo("evento_invalido", "Motivo no válido.");
  } else {
    return fallo("evento_invalido", "Resultado no válido.");
  }
  return { ok: true, evento: { ...base, tanda, nuevaTanda: { origen, filtros: [...new Set(filtros)].sort(), resultado, motivo } } };
}

export function idEvento(partes) {
  return uuidV5(ESPACIO_EVENTOS, partes.map((p) => String(p ?? "-")).join(":"));
}

// Filas a insertar, una vez verificada la pertenencia. items: Map id → ítem
// (session_id, batch_no, position, wine_id) de la sesión.
export function filasDeEvento(ev, { items }) {
  const s = ev.sesionId;
  switch (ev.tipo) {
    case "shown":
      return ev.itemIds.map((id) => ({
        id: idEvento([s, id, "shown"]), session_id: s, recommendation_item_id: id, event_type: "shown",
        payload: { tanda: items.get(id).batch_no, posicion: items.get(id).position },
      }));
    case "selected": {
      const id = ev.itemIds[0];
      return [{ id: idEvento([s, id, "selected"]), session_id: s, recommendation_item_id: id, event_type: "selected",
        payload: { tanda: items.get(id).batch_no, posicion: items.get(id).position } }];
    }
    case "bottle_opened": {
      const id = ev.itemIds[0];
      return [{ id: idEvento([s, id, "bottle_opened", ev.consumoId]), session_id: s, recommendation_item_id: id, event_type: "bottle_opened",
        payload: { tanda: items.get(id).batch_no, consumoId: ev.consumoId } }];
    }
    case "new_batch": {
      const n = ev.nuevaTanda;
      const clave = ev.tanda !== null ? [s, "new_batch", "tanda", ev.tanda] : [s, "new_batch", "sin_candidatos", n.motivo, n.filtros.join(",")];
      return [{ id: idEvento(clave), session_id: s, recommendation_item_id: null, event_type: "new_batch",
        payload: { origen: n.origen, tanda: ev.tanda, resultado: n.resultado, motivo: n.motivo, filtros: n.filtros } }];
    }
    default:
      return [];
  }
}

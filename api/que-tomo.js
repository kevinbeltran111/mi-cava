// =============================================================================
// Etapa 7.3-A / 7.4-B1: POST /api/que-tomo — «¿Qué tomo?».
// =============================================================================
// Cuerpo:
//   consulta nueva  { modo: "cellar" }
//   refinamiento    { modo: "cellar", sesionId, restriccion: { alcance: { tipo: "grape", valor } } }
//                   (7.4-B2; contrato completo en _que-tomo/refinamiento.js)
//   * Solo se atiende "cellar" («Elegir de mi cava»).
//     "food" y "discovery" → 501 modo_no_disponible (7.5). Sin modo o con
//     otro valor → 400 modo_invalido.
//   * `consulta`: ausente, null o en blanco = sin consulta (inicio directo).
//     Un texto no vacío → 400 refinamiento_no_disponible: el refinamiento
//     («hoy no quiero Malbec») llega en un bloque posterior y aceptar el
//     texto sin aplicarlo devolvería, por ejemplo, un Malbec. Otro tipo de
//     dato → 400 consulta_invalida. Ambos rechazos ocurren antes de leer
//     datos: sin motor, sin sesión y sin items. initial_input queda null.
// Flujo:
//   1. Sesión: Authorization: Bearer <access_token de Supabase>. El usuario
//      sale SIEMPRE del token (auth.getUser); cualquier user_id del cuerpo se
//      ignora.
//   2. Rol: solo admin / editor tienen cava (viewer no).
//   3. Contexto personal: lectura con el token del usuario (RLS).
//   4. Selección única (prepararCellar → 7.3-B): vinos propios con stock que
//      superan las restricciones confirmadas.
//   5. Sin candidatos → 200 { estado: "sin_candidatos", motivo } sin llamar
//      al motor ni crear sesión. motivo: biblioteca_vacia | sin_stock |
//      excluidos_por_restriccion.
//   6. Motor (motorCellar): recibe SOLO los candidatos elegibles.
//   7. Salida validada contra esos candidatos; recién entonces se crean la
//      sesión y los items de la tanda 1 con service_role.
// Refinamiento (7.4-B2): la sesión se verifica (propia, activa, cellar) antes
// de leer su contexto; los filtros se acumulan en context y la tanda N+1 se
// reserva con una escritura condicionada por context.revision (sin
// migración). Si otro pedido escribió antes, se relee y se reintenta.
// Ningún paso inventa vinos, preferencias ni explicaciones. No escribe
// user_knowledge ni recommendation_events.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { construirContexto } from "./_que-tomo/contexto.js";
import { recuperarCandidatos } from "./_que-tomo/candidatos.js";
import { MOTOR_ACTUAL, validarSalidaMotor } from "./_que-tomo/motor.js";
import { prepararCellar } from "./_que-tomo/motor_cellar.js";
import { crearSesion, registrarItems, cerrarSesion, leerSesion, actualizarContextoSesion } from "./_que-tomo/sesiones.js";
import {
  validarRefinamiento, filtrosDeSesion, acumularFiltro, temporalDeFiltros, contextoDeSesion,
  describirFiltros, revisionDe, MAX_INTENTOS_CONCURRENCIA,
} from "./_que-tomo/refinamiento.js";

// Límite para cuando el refinamiento acepte texto (bloque posterior). En
// 7.4-B1 todo texto no vacío se rechaza antes de llegar a este límite.
export const MAX_CONSULTA = 1000;
export const TIEMPO_LIMITE_MOTOR_MS = 25000;
const ROLES_CON_CAVA = ["admin", "editor"];
export const MODOS_HABILITADOS = Object.freeze(["cellar"]);
export const MODOS_POSTERGADOS = Object.freeze(["food", "discovery"]);
export const TANDA_INICIAL = 1;
const OPCIONES_SERVIDOR = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function responder(res, status, cuerpo) {
  return res.status(status).json(cuerpo);
}

function conTiempoLimite(promesa, ms) {
  let t;
  return Promise.race([
    promesa,
    new Promise((_, rechazar) => { t = setTimeout(() => rechazar(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms); }),
  ]).finally(() => clearTimeout(t));
}

// deps (para pruebas):
//   entorno      variables (por defecto process.env)
//   motor        función del motor (por defecto MOTOR_ACTUAL = motorCellar)
//   crearCliente createClient de supabase-js
//   tiempoLimiteMotorMs
export function crearHandler(deps = {}) {
  const {
    entorno = process.env,
    motor = MOTOR_ACTUAL,
    crearCliente = createClient,
    tiempoLimiteMotorMs = TIEMPO_LIMITE_MOTOR_MS,
  } = deps;

  return async function handler(req, res) {
    if (req.method !== "POST") return responder(res, 405, { error: "Método no permitido" });

    const supabaseUrl = entorno.VITE_SUPABASE_URL;
    const anonKey = entorno.VITE_SUPABASE_ANON_KEY;
    const serviceKey = entorno.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return responder(res, 500, { error: "Faltan variables de entorno en el servidor" });
    }

    // 1. Sesión
    const authHeader = String(req.headers?.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return responder(res, 401, { error: "Falta el token de sesión" });

    let userId;
    try {
      const authClient = crearCliente(supabaseUrl, anonKey, OPCIONES_SERVIDOR);
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data?.user?.id) return responder(res, 401, { error: "Sesión inválida" });
      userId = data.user.id;
    } catch {
      return responder(res, 401, { error: "Sesión inválida" });
    }

    // Cliente con el token del usuario: todas las lecturas pasan por RLS.
    const userClient = crearCliente(supabaseUrl, anonKey, {
      ...OPCIONES_SERVIDOR,
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // Entrada
    const modo = req.body?.modo;
    if (MODOS_POSTERGADOS.includes(modo)) {
      return responder(res, 501, { error: "Esta forma de recomendación todavía no está disponible.", codigo: "modo_no_disponible" });
    }
    if (!MODOS_HABILITADOS.includes(modo)) {
      return responder(res, 400, { error: "Modo de recomendación no válido.", codigo: "modo_invalido" });
    }
    const consultaCruda = req.body?.consulta;
    if (consultaCruda !== undefined && consultaCruda !== null && typeof consultaCruda !== "string") {
      return responder(res, 400, { error: "La consulta debe ser texto.", codigo: "consulta_invalida" });
    }
    if (typeof consultaCruda === "string" && consultaCruda.trim()) {
      return responder(res, 400, {
        error: "Todavía no se puede ajustar la recomendación con texto. Entrá a «Elegir de mi cava» sin escribir nada.",
        codigo: "refinamiento_no_disponible",
      });
    }
    const consulta = null;
    const ref = validarRefinamiento(req.body);
    if (!ref.ok) return responder(res, 400, { error: ref.error.mensaje, codigo: ref.codigo });
    const refinamiento = ref.refinamiento;

    // 2. Rol
    try {
      const { data: perfil, error } = await userClient.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error) return responder(res, 503, { error: "No se pudo verificar tu perfil", codigo: "perfil_no_disponible" });
      if (!perfil || !ROLES_CON_CAVA.includes(perfil.role)) {
        return responder(res, 403, { error: "«¿Qué tomo?» está disponible para cuentas con cava propia", codigo: "sin_cava" });
      }
    } catch {
      return responder(res, 503, { error: "No se pudo verificar tu perfil", codigo: "perfil_no_disponible" });
    }

    // 3. Refinamiento: la sesión se verifica ANTES de leer su contexto.
    let sesion = null;
    if (refinamiento) {
      const l = await verificarSesion(userClient, refinamiento.sesionId, userId, modo);
      if (!l.ok) return responder(res, l.status, l.cuerpo);
      sesion = l.sesion;
    }

    // 4. Contexto personal (stock vigente en cada pedido)
    const ctx = await construirContexto(userClient, userId);
    if (!ctx.ok) {
      return responder(res, 503, { error: ctx.error.mensaje, codigo: "contexto_no_disponible", tipo: ctx.error.tipo });
    }
    const resumenBiblioteca = (prep) => ({
      ...recuperarCandidatos(ctx.contexto).resumen,
      excluidosPorRestriccion: prep.sinCandidatos.excluidosPorRestriccion,
      excluidosPorFiltro: prep.sinCandidatos.excluidosPorFiltro,
    });

    const admin = () => crearCliente(supabaseUrl, serviceKey, OPCIONES_SERVIDOR);

    // ---------------------------------------------------------------------
    // A. Consulta nueva: tanda 1, sin filtros.
    // ---------------------------------------------------------------------
    if (!refinamiento) {
      const prep = preparar(ctx.contexto, []);
      if (!prep?.ok) return responder(res, 500, { error: "No se pudo preparar la recomendación", codigo: "seleccion_error" });
      // Sin candidatos: respuesta de hecho, sin motor ni sesión.
      if (prep.sinCandidatos) {
        return responder(res, 200, {
          estado: "sin_candidatos", motivo: prep.sinCandidatos.motivo, recomendaciones: [], filtros: [], biblioteca: resumenBiblioteca(prep),
        });
      }
      const m = await correrMotor(motor, prep, consulta, modo, tiempoLimiteMotorMs);
      if (!m.ok) return responder(res, m.status, m.cuerpo);
      const valor = m.valor;

      const adm = admin();
      const s = await crearSesion(adm, {
        userId,
        modo: valor.modo,
        consulta,
        contextoSesion: contextoDeSesion(valor.contextoSesion, { tanda: TANDA_INICIAL, revision: 1, filtros: [] }),
        suficiencia: valor.suficiencia,
        engineVersion: valor.engineVersion,
        model: valor.model,
      });
      if (!s.ok) return responder(res, 503, { error: s.error.mensaje, codigo: "persistencia_error" });

      const it = await registrarItems(adm, s.sesion.id, valor.recomendaciones, TANDA_INICIAL);
      if (!it.ok) {
        // La sesión quedó creada sin items: se marca como error (best effort).
        await cerrarSesion(adm, s.sesion.id, "error");
        return responder(res, 503, { error: it.error.mensaje, codigo: "persistencia_error" });
      }
      return responder(res, 200, respuestaOk({ sesionId: s.sesion.id, tanda: TANDA_INICIAL, filtros: [], valor, items: it.items }));
    }

    // ---------------------------------------------------------------------
    // B. Refinamiento: filtros acumulados + tanda siguiente, con reintento
    //    si otro pedido escribió la sesión entre la lectura y la escritura.
    // ---------------------------------------------------------------------
    const adm = admin();
    for (let intento = 1; intento <= MAX_INTENTOS_CONCURRENCIA; intento++) {
      if (intento > 1) {
        const l = await verificarSesion(userClient, refinamiento.sesionId, userId, modo);
        if (!l.ok) return responder(res, l.status, l.cuerpo);
        sesion = l.sesion;
      }
      const revision = revisionDe(sesion.context);
      const tandaActual = Number.isInteger(sesion.context?.tanda) && sesion.context.tanda >= 1 ? sesion.context.tanda : TANDA_INICIAL;
      const filtros = acumularFiltro(filtrosDeSesion(sesion.context), refinamiento.filtro);

      const prep = preparar(ctx.contexto, filtros);
      if (!prep?.ok) return responder(res, 500, { error: "No se pudo preparar la recomendación", codigo: "seleccion_error" });

      // Sin candidatos: se guarda el filtro (la sesión sigue activa), sin
      // tanda nueva ni motor.
      if (prep.sinCandidatos) {
        const w = await actualizarContextoSesion(adm, {
          sesionId: sesion.id, userId, revisionEsperada: revision,
          contexto: contextoDeSesion(sesion.context, { tanda: tandaActual, revision: (revision ?? 0) + 1, filtros }),
        });
        if (!w.ok) return responder(res, 503, { error: w.error.mensaje, codigo: "persistencia_error" });
        if (!w.actualizada) continue;
        return responder(res, 200, {
          estado: "sin_candidatos", motivo: prep.sinCandidatos.motivo, sesionId: sesion.id, tanda: null,
          filtros: describirFiltros(filtros), recomendaciones: [], biblioteca: resumenBiblioteca(prep),
        });
      }

      const m = await correrMotor(motor, prep, consulta, modo, tiempoLimiteMotorMs);
      if (!m.ok) return responder(res, m.status, m.cuerpo);
      const valor = m.valor;

      // Reserva de la tanda: la escritura condicionada asigna tandaActual + 1
      // a un único pedido; el otro relee y toma la siguiente.
      const tanda = tandaActual + 1;
      const w = await actualizarContextoSesion(adm, {
        sesionId: sesion.id, userId, revisionEsperada: revision,
        contexto: contextoDeSesion(sesion.context, { tanda, revision: (revision ?? 0) + 1, filtros }),
      });
      if (!w.ok) return responder(res, 503, { error: w.error.mensaje, codigo: "persistencia_error" });
      if (!w.actualizada) continue;

      const it = await registrarItems(adm, sesion.id, valor.recomendaciones, tanda);
      if (!it.ok) {
        // La tanda quedó reservada sin items; la sesión sigue activa y el
        // próximo pedido usará la tanda siguiente.
        return responder(res, 503, { error: it.error.mensaje, codigo: "persistencia_error" });
      }
      return responder(res, 200, respuestaOk({ sesionId: sesion.id, tanda, filtros: describirFiltros(filtros), valor, items: it.items }));
    }
    return responder(res, 409, {
      error: "La consulta se modificó al mismo tiempo desde otro pedido. Probá de nuevo.",
      codigo: "conflicto_concurrente",
    });
  };
}

function preparar(contexto, filtros) {
  try {
    return prepararCellar(contexto, { temporal: temporalDeFiltros(filtros) });
  } catch {
    return null;
  }
}

// Sesión propia (RLS + user_id del token), activa y de modo cellar. Ajena e
// inexistente responden igual (404) para no revelar que existe.
async function verificarSesion(userClient, sesionId, userId, modo) {
  const l = await leerSesion(userClient, sesionId);
  if (!l.ok) return { ok: false, status: 503, cuerpo: { error: l.error.mensaje, codigo: "sesion_no_disponible" } };
  const s = l.sesion;
  if (!s || s.user_id !== userId) return { ok: false, status: 404, cuerpo: { error: "No encontramos esa consulta.", codigo: "sesion_no_encontrada" } };
  if (s.mode !== modo) return { ok: false, status: 409, cuerpo: { error: "Esa consulta es de otro tipo.", codigo: "sesion_incompatible" } };
  if (s.status !== "active") return { ok: false, status: 409, cuerpo: { error: "Esa consulta ya terminó. Empezá una nueva.", codigo: "sesion_inactiva" } };
  return { ok: true, sesion: s };
}

async function correrMotor(motor, prep, consulta, modo, tiempoLimiteMotorMs) {
  if (typeof motor !== "function") {
    return { ok: false, status: 501, cuerpo: { error: "El recomendador todavía no está disponible", codigo: "motor_pendiente" } };
  }
  let salida;
  try {
    salida = await conTiempoLimite(Promise.resolve().then(() => motor({ ...prep.entrada, consulta })), tiempoLimiteMotorMs);
  } catch (e) {
    const tiempo = e?.name === "TimeoutError";
    return {
      ok: false,
      status: tiempo ? 504 : 502,
      cuerpo: {
        error: tiempo ? "El recomendador tardó demasiado, probá de nuevo" : "El recomendador no respondió correctamente",
        codigo: tiempo ? "motor_tiempo_agotado" : "motor_error",
      },
    };
  }
  // Solo contra los candidatos elegibles: un vino sin stock, excluido (por
  // restricción o filtro) o ajeno invalida toda la salida. Con candidatos, la
  // tanda no puede venir vacía, y el modo debe ser el pedido.
  const v = validarSalidaMotor(salida, prep.entrada.candidatos);
  if (!v.ok || v.valor.modo !== modo || v.valor.recomendaciones.length === 0) {
    return { ok: false, status: 502, cuerpo: { error: "El recomendador devolvió una respuesta no válida", codigo: "motor_invalido" } };
  }
  return { ok: true, valor: v.valor };
}

function respuestaOk({ sesionId, tanda, filtros, valor, items }) {
  const itemPorPosicion = new Map(items.map((i) => [i.position, i]));
  return {
    estado: "ok",
    sesionId,
    modo: valor.modo,
    tanda,
    filtros,
    suficiencia: valor.suficiencia,
    recomendaciones: valor.recomendaciones.map((r) => ({
      itemId: itemPorPosicion.get(r.posicion)?.id ?? null,
      posicion: r.posicion,
      rol: r.posicion === 1 ? "principal" : "alternativa",
      exploracion: Boolean(r.signals?.exploracion),
      wineId: r.candidato.wineId,
      vino: r.candidato.identidad,
      relacion: r.relationship,
      disponible: r.candidato.disponibilidad.disponible,
      stock: r.candidato.disponibilidad.stock,
      consumidoAntes: r.candidato.historial.consumidoAntes,
      vecesConsumido: r.candidato.historial.veces,
      favorito: r.candidato.favorito,
      explicacion: r.explicacion,
    })),
  };
}

export default crearHandler();

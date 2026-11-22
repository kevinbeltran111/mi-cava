// =============================================================================
// Etapa 7.3-A / 7.4-B1: POST /api/que-tomo — «¿Qué tomo?».
// =============================================================================
// Cuerpo: { modo: "cellar", consulta?: string }
//   * 7.4-B1 solo atiende "cellar" («Elegir de mi cava», primera tanda).
//     "food" y "discovery" → 501 modo_no_disponible (7.5). Sin modo o con
//     otro valor → 400 modo_invalido.
//   * `consulta` es opcional; si viene se valida (texto, hasta
//     MAX_CONSULTA) y se guarda en initial_input, pero este bloque no la
//     interpreta.
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
// Ningún paso inventa vinos, preferencias ni explicaciones. No escribe
// user_knowledge ni recommendation_events.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { construirContexto } from "./_que-tomo/contexto.js";
import { recuperarCandidatos } from "./_que-tomo/candidatos.js";
import { MOTOR_ACTUAL, validarSalidaMotor } from "./_que-tomo/motor.js";
import { prepararCellar } from "./_que-tomo/motor_cellar.js";
import { crearSesion, registrarItems, cerrarSesion } from "./_que-tomo/sesiones.js";

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
//   motor        función del motor (por defecto MOTOR_ACTUAL = null)
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
    const consulta = typeof consultaCruda === "string" && consultaCruda.trim() ? consultaCruda.trim() : null;
    if (consulta && consulta.length > MAX_CONSULTA) {
      return responder(res, 400, { error: `La consulta supera los ${MAX_CONSULTA} caracteres.`, codigo: "consulta_invalida" });
    }

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

    // 3. Contexto personal
    const ctx = await construirContexto(userClient, userId);
    if (!ctx.ok) {
      return responder(res, 503, { error: ctx.error.mensaje, codigo: "contexto_no_disponible", tipo: ctx.error.tipo });
    }

    // 4. Selección única (7.3-B)
    let prep;
    try {
      prep = prepararCellar(ctx.contexto);
    } catch {
      prep = null;
    }
    if (!prep?.ok) {
      return responder(res, 500, { error: "No se pudo preparar la recomendación", codigo: "seleccion_error" });
    }

    // 5. Sin candidatos: respuesta de hecho, sin motor ni sesión.
    if (prep.sinCandidatos) {
      return responder(res, 200, {
        estado: "sin_candidatos",
        motivo: prep.sinCandidatos.motivo,
        recomendaciones: [],
        biblioteca: { ...recuperarCandidatos(ctx.contexto).resumen, excluidosPorRestriccion: prep.sinCandidatos.excluidosPorRestriccion },
      });
    }
    const candidatos = prep.entrada.candidatos;

    // 6. Motor
    if (typeof motor !== "function") {
      return responder(res, 501, {
        error: "El recomendador todavía no está disponible",
        codigo: "motor_pendiente",
      });
    }

    let salida;
    try {
      salida = await conTiempoLimite(
        Promise.resolve().then(() => motor({ ...prep.entrada, consulta })),
        tiempoLimiteMotorMs
      );
    } catch (e) {
      const tiempo = e?.name === "TimeoutError";
      return responder(res, tiempo ? 504 : 502, {
        error: tiempo ? "El recomendador tardó demasiado, probá de nuevo" : "El recomendador no respondió correctamente",
        codigo: tiempo ? "motor_tiempo_agotado" : "motor_error",
      });
    }

    // 7. Validación y persistencia
    // Solo contra los candidatos elegibles: un vino sin stock, excluido o
    // ajeno invalida toda la salida. Con candidatos, la tanda no puede venir
    // vacía, y el modo debe ser el pedido.
    const v = validarSalidaMotor(salida, candidatos);
    if (!v.ok || v.valor.modo !== modo || v.valor.recomendaciones.length === 0) {
      return responder(res, 502, { error: "El recomendador devolvió una respuesta no válida", codigo: "motor_invalido" });
    }
    const valor = v.valor;

    const admin = crearCliente(supabaseUrl, serviceKey, OPCIONES_SERVIDOR);
    const s = await crearSesion(admin, {
      userId,
      modo: valor.modo,
      consulta,
      contextoSesion: valor.contextoSesion,
      suficiencia: valor.suficiencia,
      engineVersion: valor.engineVersion,
      model: valor.model,
    });
    if (!s.ok) return responder(res, 503, { error: s.error.mensaje, codigo: "persistencia_error" });

    const it = await registrarItems(admin, s.sesion.id, valor.recomendaciones, TANDA_INICIAL);
    if (!it.ok) {
      // La sesión quedó creada sin items: se marca como error (best effort).
      await cerrarSesion(admin, s.sesion.id, "error");
      return responder(res, 503, { error: it.error.mensaje, codigo: "persistencia_error" });
    }

    const itemPorPosicion = new Map(it.items.map((i) => [i.position, i]));
    return responder(res, 200, {
      estado: "ok",
      sesionId: s.sesion.id,
      modo: valor.modo,
      tanda: TANDA_INICIAL,
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
    });
  };
}

export default crearHandler();

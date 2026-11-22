// =============================================================================
// Etapa 7.3-A: POST /api/que-tomo — base técnica de «¿Qué tomo?».
// =============================================================================
// Flujo:
//   1. Sesión: Authorization: Bearer <access_token de Supabase>. El usuario
//      sale SIEMPRE del token (auth.getUser); cualquier user_id del cuerpo se
//      ignora.
//   2. Rol: solo admin / editor tienen cava (viewer no).
//   3. Contexto personal: lectura con el token del usuario (RLS).
//   4. Candidatos: biblioteca real, orden neutral.
//   5. Sin candidatos → 200 { estado: "sin_candidatos" } sin llamar al motor.
//   6. Motor (7.3-B). En 7.3-A no hay: 501 { codigo: "motor_pendiente" }.
//   7. Salida del motor validada contra los candidatos; recién entonces se
//      crean la sesión y los items con service_role.
// Ningún paso inventa vinos, preferencias ni explicaciones.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { construirContexto } from "./_que-tomo/contexto.js";
import { recuperarCandidatos } from "./_que-tomo/candidatos.js";
import { MOTOR_ACTUAL, validarSalidaMotor } from "./_que-tomo/motor.js";
import { crearSesion, registrarItems, cerrarSesion } from "./_que-tomo/sesiones.js";

export const MAX_CONSULTA = 1000;
export const TIEMPO_LIMITE_MOTOR_MS = 25000;
const ROLES_CON_CAVA = ["admin", "editor"];
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
    const consultaCruda = req.body?.consulta;
    if (typeof consultaCruda !== "string" || !consultaCruda.trim()) {
      return responder(res, 400, { error: "Escribí qué querés tomar o con qué comida." });
    }
    const consulta = consultaCruda.trim();
    if (consulta.length > MAX_CONSULTA) {
      return responder(res, 400, { error: `La consulta supera los ${MAX_CONSULTA} caracteres.` });
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

    // 4. Candidatos
    const { candidatos, resumen } = recuperarCandidatos(ctx.contexto);

    // 5. Sin candidatos: respuesta de hecho, sin motor ni sesión.
    if (candidatos.length === 0) {
      return responder(res, 200, { estado: "sin_candidatos", recomendaciones: [], biblioteca: resumen });
    }

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
        Promise.resolve().then(() => motor({ consulta, contexto: ctx.contexto, candidatos })),
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
    const v = validarSalidaMotor(salida, candidatos);
    if (!v.ok) {
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

    const it = await registrarItems(admin, s.sesion.id, valor.recomendaciones);
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
      suficiencia: valor.suficiencia,
      recomendaciones: valor.recomendaciones.map((r) => ({
        itemId: itemPorPosicion.get(r.posicion)?.id ?? null,
        posicion: r.posicion,
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

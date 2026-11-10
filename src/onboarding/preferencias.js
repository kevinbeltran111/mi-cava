// =============================================================================
// Etapa 7.2-A: persistencia de las preferencias del onboarding.
// =============================================================================
// Capa sin React ni estilos. Recibe el cliente de Supabase del usuario
// autenticado (src/supabaseClient.js) y su user_id (session.user.id); nunca
// usa credenciales privilegiadas. Todo pasa por las policies RLS de 7.1
// (SELECT / INSERT / UPDATE de la propia fila). Solo toca
// public.user_preferences: nunca user_knowledge ni las tablas del
// recomendador.
//
// Contrato de retorno (estilo de la casa):
//   lecturas  { carga, preferencias, error? }   ver CARGA
//   escrituras { ok: true, preferencias, ... } | { ok: false, error }
// `preferencias` en una escritura exitosa es SIEMPRE la fila que devolvió la
// base después de escribir: la interfaz debe reemplazar su estado con ese
// valor, nunca con lo que intentó guardar. Si ok === false no se confirmó
// nada y el estado local no debe darse por guardado.
//
// Cada escritura modifica solo las columnas de su operación (UPDATE con la
// lista exacta de columnas); las demás no se envían y no se pisan.
// =============================================================================

import {
  esNivelValido,
  normalizarTipos,
  normalizarVariedades,
} from "./catalogo.js";

const TABLA = "user_preferences";

const COLUMNAS = [
  "user_id",
  "onboarding_status",
  "onboarding_step",
  "onboarding_resolved_at",
  "wine_types_answer",
  "preferred_wine_types",
  "exploration_open",
  "preferred_grapes",
  "knowledge_level",
  "updated_at",
].join(",");

export const ESTADOS = Object.freeze({
  NEVER: "never",
  STARTED: "started",
  COMPLETED: "completed",
  SKIPPED: "skipped",
});

const ESTADOS_EN_CURSO = [ESTADOS.NEVER, ESTADOS.STARTED];

// Valores de user_preferences.wine_types_answer (migración 20261110000000).
// null = pregunta todavía no respondida.
export const RESPUESTA_TIPOS = Object.freeze({
  RESPONDIDA: "answered", // tipos y/o «Me gusta probar de todo»
  SIN_PREFERENCIA: "no_preference", // «No tengo preferencia todavía»
  OMITIDA: "skipped", // pregunta omitida
});

// Pasos del flujo, guardados en onboarding_step para reanudar.
export const PASOS = Object.freeze({
  BIENVENIDA: 0,
  TIPOS: 1,
  VARIEDADES: 2,
  CONOCIMIENTO: 3,
  CIERRE: 4,
});

// Estado de la carga de preferencias. PENDIENTE lo usa la interfaz como
// valor inicial mientras espera a leerPreferencias().
export const CARGA = Object.freeze({
  PENDIENTE: "pendiente",
  SIN_REGISTRO: "sin_registro",
  CON_REGISTRO: "con_registro",
  ERROR: "error",
});

// -----------------------------------------------------------------------------
// Errores
// -----------------------------------------------------------------------------

// tipo:
//   validacion  los datos no se enviaron (rechazados antes de escribir)
//   estado      la operación no corresponde al estado actual del onboarding
//   permiso     RLS / privilegios (42501)
//   restriccion CHECK, FK o unicidad (23xxx)
//   servidor    otro error informado por PostgreSQL / PostgREST
//   conexion    no hubo respuesta interpretable (red, timeout, proxy).
//               NUNCA significa «no hay preferencias».
function fallo(tipo, mensaje, causa) {
  return { ok: false, error: { tipo, mensaje, causa: causa ?? null } };
}

export function clasificarError(err) {
  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "42501") return fallo("permiso", "No tenés permiso para esta operación.", err);
  if (/^23[0-9A-Z]{3}$/.test(code)) return fallo("restriccion", "Los datos no cumplen las reglas de preferencias.", err);
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST")) {
    return fallo("servidor", "No se pudieron guardar o leer las preferencias.", err);
  }
  return fallo("conexion", "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.", err);
}

// -----------------------------------------------------------------------------
// Conversión fila ↔ preferencias
// -----------------------------------------------------------------------------

export function filaAPreferencias(f) {
  return {
    estado: f.onboarding_status,
    paso: f.onboarding_step,
    resueltoEn: f.onboarding_resolved_at,
    respuestaTipos: f.wine_types_answer,
    tipos: f.preferred_wine_types || [],
    exploracion: Boolean(f.exploration_open),
    variedades: f.preferred_grapes || [],
    nivel: f.knowledge_level,
    actualizadoEn: f.updated_at,
  };
}

// Convierte cambios de preferencias a columnas, validando. Solo las claves
// presentes en `cambios` se convierten:
//   tipos:      { respuesta, tipos?, exploracion? }
//                 respuesta = RESPUESTA_TIPOS.*; escribe siempre las tres
//                 columnas de la pregunta juntas para que queden coherentes.
//   variedades: array de ids del catálogo ([] = sin variedades)
//   nivel:      'beginner' | 'intermediate' | 'advanced' | null (sin responder)
// Devuelve { ok: true, columnas } o un fallo de tipo 'validacion'.
export function cambiosAColumnas(cambios) {
  if (cambios == null || typeof cambios !== "object" || Array.isArray(cambios)) {
    return fallo("validacion", "Cambios de preferencias no válidos.");
  }
  const desconocidas = Object.keys(cambios).filter((k) => !["tipos", "variedades", "nivel"].includes(k));
  if (desconocidas.length) return fallo("validacion", `Campo no permitido: ${desconocidas.join(", ")}.`);

  const columnas = {};

  if ("tipos" in cambios) {
    const t = cambios.tipos;
    if (t == null || typeof t !== "object") return fallo("validacion", "Respuesta de tipos no válida.");
    if (t.respuesta === RESPUESTA_TIPOS.RESPONDIDA) {
      const norm = normalizarTipos(t.tipos ?? []);
      if (!norm.ok) return fallo("validacion", norm.error);
      if (t.exploracion != null && typeof t.exploracion !== "boolean") {
        return fallo("validacion", "«Me gusta probar de todo» debe ser verdadero o falso.");
      }
      const exploracion = t.exploracion === true;
      if (norm.valor.length === 0 && !exploracion) {
        return fallo("validacion", "Elegí al menos un tipo o «Me gusta probar de todo».");
      }
      columnas.wine_types_answer = RESPUESTA_TIPOS.RESPONDIDA;
      columnas.preferred_wine_types = norm.valor;
      columnas.exploration_open = exploracion;
    } else if (t.respuesta === RESPUESTA_TIPOS.SIN_PREFERENCIA || t.respuesta === RESPUESTA_TIPOS.OMITIDA) {
      // No se descarta en silencio lo que contradiga la respuesta.
      if ((t.tipos && t.tipos.length) || t.exploracion === true) {
        return fallo("validacion", "Esta respuesta no lleva tipos ni «Me gusta probar de todo».");
      }
      columnas.wine_types_answer = t.respuesta;
      columnas.preferred_wine_types = [];
      columnas.exploration_open = false;
    } else {
      return fallo("validacion", "Respuesta de tipos no válida.");
    }
  }

  if ("variedades" in cambios) {
    const norm = normalizarVariedades(cambios.variedades);
    if (!norm.ok) return fallo("validacion", norm.error);
    columnas.preferred_grapes = norm.valor;
  }

  if ("nivel" in cambios) {
    if (cambios.nivel !== null && !esNivelValido(cambios.nivel)) {
      return fallo("validacion", "Nivel de conocimiento no válido.");
    }
    columnas.knowledge_level = cambios.nivel;
  }

  return { ok: true, columnas };
}

function pasoValido(paso) {
  return Number.isInteger(paso) && paso >= PASOS.BIENVENIDA && paso <= PASOS.CIERRE;
}

// -----------------------------------------------------------------------------
// Operaciones internas
// -----------------------------------------------------------------------------

function requiereUsuario(userId) {
  return typeof userId === "string" && userId.length > 0
    ? null
    : fallo("validacion", "Falta el usuario autenticado.");
}

// Crea la fila del usuario si no existe (INSERT ... ON CONFLICT DO NOTHING).
// Nunca modifica una fila existente.
async function asegurarRegistro(client, userId) {
  try {
    const { error } = await client
      .from(TABLA)
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    return error ? clasificarError(error) : { ok: true };
  } catch (e) {
    return clasificarError(e);
  }
}

// UPDATE de la fila propia con exactamente `columnas`. Si `soloEstados`
// viene, solo actualiza cuando onboarding_status está en esa lista.
// Devuelve { ok: true, fila } o { ok: true, fila: null } si no coincidió
// ninguna fila, o un fallo.
async function actualizar(client, userId, columnas, soloEstados) {
  try {
    let q = client.from(TABLA).update(columnas).eq("user_id", userId);
    if (soloEstados) q = q.in("onboarding_status", soloEstados);
    const { data, error } = await q.select(COLUMNAS);
    if (error) return clasificarError(error);
    if (!Array.isArray(data)) return fallo("conexion", "Respuesta inesperada al guardar.");
    return { ok: true, fila: data[0] || null };
  } catch (e) {
    return clasificarError(e);
  }
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

// Lee las preferencias del usuario. Distingue:
//   CARGA.SIN_REGISTRO  la consulta funcionó y no hay fila (equivale a never)
//   CARGA.CON_REGISTRO  hay fila → preferencias
//   CARGA.ERROR         no se pudo leer → error. No implica ausencia de datos.
export async function leerPreferencias(client, userId) {
  const sinUsuario = requiereUsuario(userId);
  if (sinUsuario) return { carga: CARGA.ERROR, preferencias: null, error: sinUsuario.error };
  try {
    const { data, error } = await client.from(TABLA).select(COLUMNAS).eq("user_id", userId).maybeSingle();
    if (error) return { carga: CARGA.ERROR, preferencias: null, error: clasificarError(error).error };
    if (!data) return { carga: CARGA.SIN_REGISTRO, preferencias: null };
    return { carga: CARGA.CON_REGISTRO, preferencias: filaAPreferencias(data) };
  } catch (e) {
    return { carga: CARGA.ERROR, preferencias: null, error: clasificarError(e).error };
  }
}

// ¿Corresponde mostrar el onboarding automáticamente?
//   null  todavía no se sabe (carga pendiente)
//   false error de lectura (no se bloquea el acceso a la cava) o ya resuelto
//   true  sin registro, never o started
export function debeMostrarOnboarding(lectura) {
  if (!lectura || lectura.carga === CARGA.PENDIENTE) return null;
  if (lectura.carga === CARGA.ERROR) return false;
  if (lectura.carga === CARGA.SIN_REGISTRO) return true;
  return ESTADOS_EN_CURSO.includes(lectura.preferencias?.estado);
}

// Paso desde el que se abre el onboarding: started reanuda en el último paso
// guardado; sin registro o never empieza en la bienvenida.
export function pasoParaReanudar(preferencias) {
  if (!preferencias || preferencias.estado !== ESTADOS.STARTED) return PASOS.BIENVENIDA;
  return pasoValido(preferencias.paso) ? preferencias.paso : PASOS.TIPOS;
}

// «Empezar»: crea la fila si hace falta y pasa de never a started en el
// paso TIPOS. Si ya estaba started, no toca nada (reanuda con lo guardado).
// Si ya estaba resuelto, tampoco toca nada: devuelve ok con yaResuelto.
export async function iniciarOnboarding(client, userId) {
  const sinUsuario = requiereUsuario(userId);
  if (sinUsuario) return sinUsuario;
  const r0 = await asegurarRegistro(client, userId);
  if (!r0.ok) return r0;
  const r = await actualizar(
    client,
    userId,
    { onboarding_status: ESTADOS.STARTED, onboarding_step: PASOS.TIPOS },
    [ESTADOS.NEVER]
  );
  if (!r.ok) return r;
  if (r.fila) return { ok: true, preferencias: filaAPreferencias(r.fila) };
  return releerSinCambios(client, userId);
}

// Guarda la respuesta de un paso (y opcionalmente el paso alcanzado) durante
// el onboarding. Solo escribe las columnas de `cambios` y onboarding_step;
// deja onboarding_status en started. Las respuestas de otros pasos no se
// tocan, así que Atrás / Siguiente / reanudar las conservan.
// Si el onboarding ya está resuelto devuelve un fallo de tipo 'estado':
// para cambiar preferencias después hay que usar editarPreferencias().
export async function guardarProgreso(client, userId, { cambios = {}, paso } = {}) {
  const sinUsuario = requiereUsuario(userId);
  if (sinUsuario) return sinUsuario;
  const conv = cambiosAColumnas(cambios);
  if (!conv.ok) return conv;
  if (paso !== undefined && !pasoValido(paso)) return fallo("validacion", "Paso no válido.");
  const columnas = { ...conv.columnas, onboarding_status: ESTADOS.STARTED };
  if (paso !== undefined) columnas.onboarding_step = paso;

  const r0 = await asegurarRegistro(client, userId);
  if (!r0.ok) return r0;
  const r = await actualizar(client, userId, columnas, ESTADOS_EN_CURSO);
  if (!r.ok) return r;
  if (r.fila) return { ok: true, preferencias: filaAPreferencias(r.fila) };
  return fallo("estado", "El onboarding ya está resuelto; no se guardó el progreso.");
}

// «Ir a Mi Cava» desde el cierre. Puede incluir la última respuesta en
// `cambios`, que se guarda en la misma sentencia. Si ya estaba resuelto:
// sin cambios → ok con yaResuelto (doble clic, otra pestaña); con cambios →
// fallo 'estado' (no se aplicaron).
export async function completarOnboarding(client, userId, { cambios = {} } = {}) {
  return resolver(client, userId, ESTADOS.COMPLETED, cambios, PASOS.CIERRE);
}

// «Ahora no, ir a mi cava» u Omitir. Conserva las respuestas y el paso ya
// guardados (no borra nada). Idempotente si ya estaba resuelto.
export async function omitirOnboarding(client, userId) {
  return resolver(client, userId, ESTADOS.SKIPPED, {}, undefined);
}

async function resolver(client, userId, estado, cambios, paso) {
  const sinUsuario = requiereUsuario(userId);
  if (sinUsuario) return sinUsuario;
  const conv = cambiosAColumnas(cambios);
  if (!conv.ok) return conv;
  const columnas = {
    ...conv.columnas,
    onboarding_status: estado,
    onboarding_resolved_at: new Date().toISOString(),
  };
  if (paso !== undefined) columnas.onboarding_step = paso;

  const r0 = await asegurarRegistro(client, userId);
  if (!r0.ok) return r0;
  const r = await actualizar(client, userId, columnas, ESTADOS_EN_CURSO);
  if (!r.ok) return r;
  if (r.fila) return { ok: true, preferencias: filaAPreferencias(r.fila) };
  if (Object.keys(conv.columnas).length) {
    return fallo("estado", "El onboarding ya estaba resuelto; los cambios no se guardaron.");
  }
  return releerSinCambios(client, userId);
}

// Edición posterior. Escribe solo las columnas de preferencias indicadas;
// nunca onboarding_status, onboarding_step ni onboarding_resolved_at, así
// que completed / skipped (y never / started) se conservan. Si el usuario
// no tenía fila, la crea en never.
export async function editarPreferencias(client, userId, cambios) {
  const sinUsuario = requiereUsuario(userId);
  if (sinUsuario) return sinUsuario;
  const conv = cambiosAColumnas(cambios);
  if (!conv.ok) return conv;
  if (Object.keys(conv.columnas).length === 0) return fallo("validacion", "No hay cambios para guardar.");
  const r0 = await asegurarRegistro(client, userId);
  if (!r0.ok) return r0;
  const r = await actualizar(client, userId, conv.columnas);
  if (!r.ok) return r;
  if (r.fila) return { ok: true, preferencias: filaAPreferencias(r.fila) };
  return fallo("estado", "No se encontró el registro de preferencias; no se guardaron los cambios.");
}

async function releerSinCambios(client, userId) {
  const l = await leerPreferencias(client, userId);
  if (l.carga === CARGA.CON_REGISTRO) {
    const yaResuelto = !ESTADOS_EN_CURSO.includes(l.preferencias.estado);
    return { ok: true, preferencias: l.preferencias, sinCambios: true, yaResuelto };
  }
  if (l.carga === CARGA.ERROR) return { ok: false, error: l.error };
  return fallo("estado", "No se encontró el registro de preferencias.");
}

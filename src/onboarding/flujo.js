// =============================================================================
// Etapa 7.2-B: reglas puras del onboarding (sin React, sin red).
// Las usan Onboarding.jsx y App.jsx; se prueban en tests/onboarding/.
// =============================================================================

import { CARGA, RESPUESTA_TIPOS, debeMostrarOnboarding } from "./preferencias.js";
import { IDS_TIPOS_VINO } from "./catalogo.js";

// Roles con cava propia (mismo criterio que hasCava en App.jsx).
export function rolConCava(rol) {
  return rol === "admin" || rol === "editor";
}

// Qué mostrar para el usuario actual:
//   null          todavía no se sabe (lectura pendiente)
//   "pantalla"    onboarding a pantalla completa (usuario nuevo: acaba de
//                 crear su perfil en esta sesión)
//   "invitacion"  aviso discreto y no bloqueante sobre la biblioteca
//                 (usuario existente con onboarding sin resolver)
//   "nada"        viewer, sin perfil, ya resuelto o error de lectura
// Un error de lectura nunca muestra el onboarding: si no se pudo leer, no se
// sabe si ya lo resolvió y no se debe bloquear ni insistir.
export function decidirOnboarding({ rol, lectura, perfilRecienCreado }) {
  if (!rolConCava(rol)) return "nada";
  const mostrar = debeMostrarOnboarding(lectura);
  if (mostrar === null) return null;
  if (!mostrar) return "nada";
  return perfilRecienCreado ? "pantalla" : "invitacion";
}

// -----------------------------------------------------------------------------
// Selección de la pregunta de tipos
// -----------------------------------------------------------------------------
// { tipos: string[], exploracion: bool, sinPreferencia: bool }
//   «No tengo preferencia todavía» excluye tipos y «Me gusta probar de todo».
//   «Me gusta probar de todo» puede convivir con tipos.

export const SELECCION_TIPOS_VACIA = Object.freeze({ tipos: [], exploracion: false, sinPreferencia: false });

export function seleccionTiposDesdePreferencias(p) {
  if (!p) return { ...SELECCION_TIPOS_VACIA };
  return {
    tipos: [...(p.tipos || [])],
    exploracion: Boolean(p.exploracion),
    sinPreferencia: p.respuestaTipos === RESPUESTA_TIPOS.SIN_PREFERENCIA,
  };
}

export function alternarTipo(sel, id) {
  const activo = sel.tipos.includes(id);
  const set = new Set(sel.tipos);
  if (activo) set.delete(id);
  else set.add(id);
  return { ...sel, tipos: IDS_TIPOS_VINO.filter((t) => set.has(t)), sinPreferencia: false };
}

export function alternarExploracion(sel) {
  return { ...sel, exploracion: !sel.exploracion, sinPreferencia: false };
}

export function alternarSinPreferencia(sel) {
  return sel.sinPreferencia
    ? { ...sel, sinPreferencia: false }
    : { tipos: [], exploracion: false, sinPreferencia: true };
}

// Respuesta a guardar. Sin nada elegido = pregunta omitida.
export function respuestaTipos(sel) {
  if (sel.sinPreferencia) return { respuesta: RESPUESTA_TIPOS.SIN_PREFERENCIA };
  if (sel.tipos.length || sel.exploracion) {
    return { respuesta: RESPUESTA_TIPOS.RESPONDIDA, tipos: [...sel.tipos], exploracion: sel.exploracion };
  }
  return { respuesta: RESPUESTA_TIPOS.OMITIDA };
}

// Tipos que ordenan las variedades: solo los elegidos explícitamente.
export function tiposParaPriorizar(sel) {
  return sel.sinPreferencia ? [] : [...sel.tipos];
}

export function alternarEnLista(lista, id) {
  return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

// Pregunta de conocimiento: elegir de nuevo la opción marcada la desmarca
// (la pregunta es opcional).
export function alternarNivel(actual, id) {
  return actual === id ? null : id;
}

// -----------------------------------------------------------------------------
// Edición posterior («Mis preferencias»): solo se envía lo que cambió.
// -----------------------------------------------------------------------------
function mismaLista(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function cambiosEdicion(inicial, actual) {
  const cambios = {};
  const ti = inicial.seleccionTipos;
  const ta = actual.seleccionTipos;
  if (
    !mismaLista([...ti.tipos].sort(), [...ta.tipos].sort()) ||
    ti.exploracion !== ta.exploracion ||
    ti.sinPreferencia !== ta.sinPreferencia
  ) {
    cambios.tipos = respuestaTipos(ta);
  }
  if (!mismaLista(inicial.variedades, actual.variedades)) cambios.variedades = [...actual.variedades];
  if (inicial.nivel !== actual.nivel) cambios.nivel = actual.nivel;
  return cambios;
}

// -----------------------------------------------------------------------------
// Tiempo límite: ninguna espera bloquea indefinidamente la aplicación.
// -----------------------------------------------------------------------------
export const TIEMPO_LIMITE_MS = 10000;

export function lecturaConTiempoLimite(promesa, ms = TIEMPO_LIMITE_MS) {
  let t;
  const limite = new Promise((resolve) => {
    t = setTimeout(
      () => resolve({ carga: CARGA.ERROR, preferencias: null, error: { tipo: "conexion", mensaje: "Tiempo de espera agotado." } }),
      ms
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
}

export function escrituraConTiempoLimite(promesa, ms = TIEMPO_LIMITE_MS) {
  let t;
  const limite = new Promise((resolve) => {
    t = setTimeout(
      () => resolve({ ok: false, error: { tipo: "conexion", mensaje: "Tiempo de espera agotado." } }),
      ms
    );
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(t));
}

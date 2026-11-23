// =============================================================================
// Etapa 7.4 — Bloque 1: «Elegir de mi cava», primera tanda.
// =============================================================================
// Dos funciones, en este orden:
//
//   prepararCellar(contexto)  → la ÚNICA selección de candidatos. Reutiliza
//       7.3-B (construirConocimiento + seleccionarParaConsulta, modo
//       'cellar'): solo vinos propios con stock > 0 que no alcanza ninguna
//       restricción CONFIRMADA, persistente o temporal (7.4-B2: filtros de la
//       sesión), ni una reserva activa (7.4-B3). Si no queda ninguno
//       devuelve el motivo (biblioteca_vacia | sin_stock |
//       excluidos_por_restriccion | excluidos_por_filtro |
//       excluidos_por_reserva) y el endpoint responde sin llamar al motor.
//
//   motorCellar(entrada)      → ordena esos candidatos y redacta las
//       explicaciones con reglas fijas. No vuelve a seleccionar, no lee la
//       base, no llama a ningún modelo de IA y no recibe la biblioteca
//       completa: solo los candidatos elegibles y las variedades declaradas.
//
// Fuera de este bloque: precio / presupuesto (no interviene en el orden ni en
// las explicaciones), restricciones temporales, tandas posteriores, eventos y
// cualquier escritura en user_knowledge.
//
// -----------------------------------------------------------------------------
// REGLA DE ORDEN (confianza), de mayor a menor. Se compara criterio por
// criterio; el siguiente solo decide si el anterior empata.
//   1. favorito: marcado como favorito primero.
//   2. grupo de puntuación:
//        «buena»       promedio de experiencias puntuadas >= 4 estrellas
//        «sin puntuar» ninguna experiencia puntuada (satisfacción
//                      desconocida: NO cuenta como 0 ni como buena)
//        «baja»        promedio < 4
//   3. promedio de puntuación, mayor primero (solo entre puntuados).
//   4. cantidad de experiencias puntuadas, mayor primero.
//   5. desempate final: orden neutral de la biblioteca de 7.3-A
//      (agregado más recientemente primero; a igual fecha, id ascendente).
// Stock, cantidad de botellas, consumos sin puntuar y precio NO intervienen.
//
// SELECCIÓN DE LA TANDA (máximo 3 vinos distintos):
//   * principal: el primero del orden de confianza;
//   * exploración: el primer vino, en orden de confianza y distinto de la
//     principal, que (a) es monovarietal exacto, (b) su variedad está entre
//     las declaradas en el onboarding y (c) no tiene experiencias
//     registradas. Si existe, ocupa una plaza de alternativa;
//   * las plazas restantes se completan con el orden de confianza;
//   * las alternativas se presentan en orden de confianza (la de
//     exploración queda marcada, no se mueve de lugar).
// Varias unidades del mismo vino son un solo candidato (un wineId).
// =============================================================================

import { construirConocimiento, seleccionarParaConsulta } from "./conocimiento/index.js";
import { CLASIFICACION, etiquetaDeVariedad } from "./conocimiento/normalizacion.js";
import { recuperarCandidatos } from "./candidatos.js";
import { fallo } from "./errores.js";

export const VERSION_MOTOR_CELLAR = "7.4-B1.1";
export const MODO_CELLAR = "cellar";
export const MAX_TANDA = 3;
// Umbral de «buena puntuación» (escala de 0,5 a 5 estrellas). Parámetro de
// calibración: se cambia acá y las pruebas lo leen de esta constante.
export const UMBRAL_BUENA_PUNTUACION = 4;

export const MOTIVOS_SIN_CANDIDATOS = Object.freeze({
  BIBLIOTECA_VACIA: "biblioteca_vacia",
  SIN_STOCK: "sin_stock",
  // todo lo disponible lo excluyen restricciones PERSISTENTES del usuario
  EXCLUIDOS: "excluidos_por_restriccion",
  // 7.4-B2: hay vinos disponibles que solo excluye un filtro TEMPORAL de la
  // sesión («hoy no quiero Malbec»); sin ese filtro habría candidatos
  EXCLUIDOS_POR_FILTRO: "excluidos_por_filtro",
  // 7.4-B3: hay vinos disponibles que solo excluye una RESERVA «para una
  // ocasión especial»; sin la reserva habría candidatos
  EXCLUIDOS_POR_RESERVA: "excluidos_por_reserva",
});

const GRUPO = Object.freeze({ BUENA: 2, SIN_PUNTUAR: 1, BAJA: 0 });

// -----------------------------------------------------------------------------
// 1. Selección (una sola vez, en el endpoint)
// -----------------------------------------------------------------------------

// contexto: representarContexto (7.3-A). temporal: entrada de
// normalizarContextoTemporal (7.4-B2: filtros de la sesión; vacío en una
// consulta nueva). prioridad: orden en que se nombra el motivo cuando lo
// disponible quedó excluido a la vez por filtros y por reservas (7.4-B3: al
// reservar, la reserva va primero).
// → { ok: true, sinCandidatos: { motivo, ... } }
// | { ok: true, entrada: { modo, candidatos, preferencias } }
// | fallo
export function prepararCellar(contexto, { temporal = {}, prioridad = ["temporal", "reserva"] } = {}) {
  const { perfil, extraccion } = construirConocimiento(contexto);
  const sel = seleccionarParaConsulta({ contexto, perfil, extraccion }, { modo: MODO_CELLAR, temporal });
  if (!sel.ok) return sel;
  const s = sel.seleccion;
  const biblioteca = contexto?.biblioteca || [];

  // Forma de candidatos.js (la misma que usa validarSalidaMotor), filtrada a
  // los ids que dejó la selección de 7.3-B y enriquecida con su
  // clasificación de variedad.
  const elegidos = new Map(s.candidatos.map((c) => [c.wineId, c]));
  const candidatos = [];
  recuperarCandidatos(contexto).candidatos.forEach((c, ordenNeutral) => {
    const sc = elegidos.get(c.wineId);
    if (!sc) return;
    const v = extraccion.vinos.get(c.wineId)?.variedad;
    candidatos.push({
      ...c,
      ordenNeutral,
      variedad: v ? { estado: v.estado, detalle: v.detalle ?? null, ids: [...v.ids], texto: c.identidad.varietal } : null,
      coincidenciasInciertas: sc.coincidenciasInciertas,
    });
  });

  if (!candidatos.length) {
    const disponibles = biblioteca.filter((v) => v.hechos.disponibilidad.disponible).length;
    // Sin candidatos y con stock: todo lo disponible quedó excluido. Un vino
    // alcanzado por una restricción PERSISTENTE seguiría excluido aunque se
    // quiten filtros y reservas. Si algún vino lo excluyen solo filtros
    // temporales y/o reservas, el motivo es ese (sin él habría candidatos),
    // no la cava; si hay de los dos, decide `prioridad`.
    const persistente = (x) => x.motivos.some((m) => m.origen === "persistente");
    const levantables = s.excluidos.filter((x) => !persistente(x));
    const cuenta = (origen) => levantables.filter((x) => x.motivos.some((m) => m.origen === origen)).length;
    const porOrigen = { temporal: cuenta("temporal"), reserva: cuenta("reserva") };
    const MOTIVO_DE = { temporal: MOTIVOS_SIN_CANDIDATOS.EXCLUIDOS_POR_FILTRO, reserva: MOTIVOS_SIN_CANDIDATOS.EXCLUIDOS_POR_RESERVA };
    const levantable = prioridad.find((o) => porOrigen[o] > 0);
    const motivo = biblioteca.length === 0
      ? MOTIVOS_SIN_CANDIDATOS.BIBLIOTECA_VACIA
      : disponibles === 0
        ? MOTIVOS_SIN_CANDIDATOS.SIN_STOCK
        : levantable
          ? MOTIVO_DE[levantable]
          : MOTIVOS_SIN_CANDIDATOS.EXCLUIDOS;
    return {
      ok: true,
      sinCandidatos: {
        motivo,
        excluidosPorRestriccion: s.excluidos.length - levantables.length,
        excluidosPorFiltro: porOrigen.temporal,
        excluidosPorReserva: porOrigen.reserva,
      },
    };
  }

  const declaradas = perfil.declarado?.registrada ? [...(perfil.declarado.variedades || [])] : [];
  return {
    ok: true,
    entrada: { modo: MODO_CELLAR, candidatos, preferencias: { variedadesDeclaradas: declaradas } },
  };
}

// -----------------------------------------------------------------------------
// 2. Orden de confianza
// -----------------------------------------------------------------------------

export function claveConfianza(c) {
  const { promedio, puntuadas } = c.valoracion;
  const grupo = promedio === null || promedio === undefined
    ? GRUPO.SIN_PUNTUAR
    : promedio >= UMBRAL_BUENA_PUNTUACION ? GRUPO.BUENA : GRUPO.BAJA;
  return {
    favorito: c.favorito ? 1 : 0,
    grupoPuntuacion: grupo,
    promedio: promedio ?? null,
    puntuadas,
    ordenNeutral: c.ordenNeutral,
  };
}

export function compararConfianza(a, b) {
  const x = claveConfianza(a);
  const y = claveConfianza(b);
  return (
    y.favorito - x.favorito ||
    y.grupoPuntuacion - x.grupoPuntuacion ||
    (y.promedio ?? 0) - (x.promedio ?? 0) ||
    y.puntuadas - x.puntuadas ||
    x.ordenNeutral - y.ordenNeutral
  );
}

function variedadDeclarada(c, declaradas) {
  const v = c.variedad;
  if (!v || v.estado !== CLASIFICACION.MONOVARIETAL || v.detalle !== "exacta" || v.ids.length !== 1) return null;
  return declaradas.includes(v.ids[0]) ? v.ids[0] : null;
}

function vecesRegistradas(c) {
  return c.valoracion.puntuadas + c.valoracion.sinPuntuar;
}

export function esExploracion(c, declaradas) {
  return Boolean(variedadDeclarada(c, declaradas)) && vecesRegistradas(c) === 0;
}

// -----------------------------------------------------------------------------
// 3. Explicaciones verificables
// -----------------------------------------------------------------------------
// Cada afirmación es un dato (grounding) y su texto se deriva solo de ese
// dato. «Sin experiencias registradas» no dice que nunca lo haya tomado.

const formatoEstrellas = (n) => n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function afirmacionesDe(c, { declaradas, exploracion }) {
  const a = [];
  if (c.favorito) a.push({ tipo: "favorito", fuente: "wine_privado.favorito" });
  const { puntuadas, sinPuntuar, promedio } = c.valoracion;
  if (puntuadas > 0) a.push({ tipo: "puntuacion", promedio, experiencias: puntuadas, fuente: "consumos.puntuacion" });
  else if (sinPuntuar > 0) a.push({ tipo: "experiencias_sin_puntuar", experiencias: sinPuntuar, fuente: "consumos" });
  const decl = variedadDeclarada(c, declaradas);
  if (decl) a.push({ tipo: "variedad_declarada", variedad: decl, etiqueta: etiquetaDeVariedad(decl) ?? decl, fuente: "user_preferences.preferred_grapes" });
  if (exploracion) a.push({ tipo: "sin_experiencias_registradas", fuente: "consumos" });
  if (!a.length) a.push({ tipo: "disponibilidad", stock: c.disponibilidad.stock, fuente: "wine_privado.stock" });
  return a;
}

export function textoDeAfirmacion(x) {
  switch (x.tipo) {
    case "favorito":
      return "Lo marcaste como favorito.";
    case "puntuacion":
      return x.experiencias === 1
        ? `Lo puntuaste con ${formatoEstrellas(x.promedio)} estrellas.`
        : `Lo puntuaste con ${formatoEstrellas(x.promedio)} estrellas en promedio, en ${x.experiencias} experiencias.`;
    case "experiencias_sin_puntuar":
      return x.experiencias === 1
        ? "Registraste una experiencia con este vino, sin puntuación."
        : `Registraste ${x.experiencias} experiencias con este vino, sin puntuación.`;
    case "variedad_declarada":
      return `Es un ${x.etiqueta}, una de las variedades que elegiste en tus preferencias.`;
    case "sin_experiencias_registradas":
      return "Todavía no registraste experiencias con este vino.";
    case "disponibilidad":
      return x.stock === 1
        ? "Está disponible en tu cava: tenés 1 botella."
        : `Está disponible en tu cava: tenés ${x.stock} botellas.`;
    default:
      throw new Error(`Afirmación desconocida: ${x.tipo}`);
  }
}

export function explicar(afirmaciones) {
  return afirmaciones.map(textoDeAfirmacion).join(" ");
}

// -----------------------------------------------------------------------------
// 4. Motor
// -----------------------------------------------------------------------------

// entrada: la que devuelve prepararCellar (más `consulta`, que en este bloque
// no se interpreta). Devuelve una SalidaMotor (motor.js).
export function motorCellar(entrada) {
  if (entrada?.modo !== MODO_CELLAR) return fallo("validacion", "El motor de la cava solo atiende el modo cellar.");
  const declaradas = entrada.preferencias?.variedadesDeclaradas || [];
  const orden = (entrada.candidatos || []).filter((c) => c.persistible && c.disponibilidad.disponible).sort(compararConfianza);

  const elegidos = [];
  let exploracion = null;
  if (orden.length) {
    elegidos.push(orden[0]);
    exploracion = orden.slice(1).find((c) => esExploracion(c, declaradas)) || null;
    if (exploracion) elegidos.push(exploracion);
    for (const c of orden) {
      if (elegidos.length >= MAX_TANDA) break;
      if (!elegidos.includes(c)) elegidos.push(c);
    }
  }
  const [principal, ...alternativas] = elegidos;
  const tanda = principal ? [principal, ...alternativas.sort(compararConfianza)] : [];

  return {
    modo: MODO_CELLAR,
    suficiencia: null,
    contextoSesion: { entrada: "elegir_de_mi_cava", tanda: 1 },
    engineVersion: VERSION_MOTOR_CELLAR,
    model: null,
    recomendaciones: tanda.map((c, i) => {
      const esExp = c === exploracion;
      const afirmaciones = afirmacionesDe(c, { declaradas, exploracion: esExp });
      return {
        wineId: c.wineId,
        relationship: "owned", // todo candidato de la cava tiene stock
        explicacion: explicar(afirmaciones),
        signals: {
          rol: i === 0 ? "principal" : "alternativa",
          exploracion: esExp,
          orden: claveConfianza(c),
          regla: VERSION_MOTOR_CELLAR,
        },
        grounding: { version: VERSION_MOTOR_CELLAR, afirmaciones },
      };
    }),
  };
}

// =============================================================================
// Etapa 7.3-B: normalización CONSERVADORA de variedades y bodegas.
// =============================================================================
// wines.varietal y wines.bodega son texto libre (cargado a mano o leído de la
// etiqueta por IA). user_preferences.preferred_grapes usa ids del catálogo de
// 7.2 (src/onboarding/catalogo.js). Este módulo traduce texto → id del
// catálogo SOLO cuando no hay ambigüedad. Nunca adivina:
//
//   * no hay sinónimos (p. ej. Shiraz → Syrah): el catálogo no los define y
//     agregarlos es una decisión de producto pendiente;
//   * una palabra suelta que forma parte de varias variedades («Cabernet»,
//     «Pinot», «Sauvignon»…) vuelve la clasificación 'ambigua';
//   * dos o más variedades en el mismo texto son un 'corte': sus componentes
//     se conservan, pero no cuentan como evidencia monovarietal;
//   * una variedad separada de texto no reconocido («Malbec / Shiraz») es un
//     corte con componentes incompletos, no un monovarietal. Sin separador
//     («Malbec Reserva») el texto extra se trata como adicional: con un
//     catálogo sin sinónimos no se puede distinguir un descriptor de una
//     cepa desconocida (límite conocido);
//   * el tipo de vino (tinto, blanco…) NO se deduce de la variedad.
//
// Bodegas: solo se unifican mayúsculas, acentos, puntuación y espacios. No se
// quitan palabras («Bodega X» y «X» quedan separadas).
// =============================================================================

import { VARIEDADES } from "../../../src/onboarding/catalogo.js";

export const VERSION_NORMALIZACION = "7.3-B.1";

// Estados de clasificación de un varietal.
export const CLASIFICACION = Object.freeze({
  SIN_DATO: "sin_dato", // varietal vacío
  MONOVARIETAL: "monovarietal", // una sola variedad del catálogo, sin ambigüedad
  CORTE: "corte", // dos o más variedades, o marcador explícito de corte
  AMBIGUA: "ambigua", // hay palabras de variedades que no se pueden resolver
  NO_RECONOCIDA: "no_reconocida", // ninguna variedad del catálogo
});

// Palabras que indican un corte. Solo marcadores inequívocos.
const MARCADORES_CORTE = new Set(["blend", "corte", "assemblage", "ensamblaje", "coupage"]);
// Palabras de enlace que no son un componente («Corte de Malbec y Syrah»).
const CONECTORES = new Set(["de", "del", "y", "e", "con"]);
// Separadores entre variedades de un corte («Malbec - Cabernet Franc»).
const SEPARADORES_CORTE = /[-/+&,;]|\by\b|\be\b/;

export function normalizarTexto(s) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Nombres aceptados por variedad: su etiqueta (partida por «/», p. ej.
// «Pinot Gris / Pinot Grigio») y su id con espacios. Nada más.
const NOMBRES = [];
for (const v of VARIEDADES) {
  const formas = new Set([normalizarTexto(v.id.replace(/_/g, " "))]);
  for (const parte of v.etiqueta.split("/")) formas.add(normalizarTexto(parte));
  for (const f of formas) if (f) NOMBRES.push({ id: v.id, tokens: f.split(" ") });
}
// Más largo primero: «cabernet sauvignon» gana sobre cualquier nombre corto.
NOMBRES.sort((a, b) => b.tokens.length - a.tokens.length);

// Todas las palabras que aparecen en algún nombre del catálogo. Si una queda
// suelta (sin formar un nombre completo), el texto es ambiguo.
const TOKENS_DE_VARIEDAD = new Set(NOMBRES.flatMap((n) => n.tokens));

const POR_ID = new Map(VARIEDADES.map((v) => [v.id, v]));

export function etiquetaDeVariedad(id) {
  return POR_ID.get(id)?.etiqueta ?? null;
}

// Clasifica un varietal escrito libremente.
// Devuelve { estado, ids, texto, detalle }:
//   ids     ids del catálogo en orden de aparición (sin repetir)
//   detalle 'exacta' | 'con_texto_adicional' | 'explicito' | 'sin_separador'
//           | 'componentes_incompletos' | null
export function clasificarVarietal(texto) {
  const original = typeof texto === "string" ? texto.trim() : "";
  const n = normalizarTexto(original);
  if (!n) return { estado: CLASIFICACION.SIN_DATO, ids: [], texto: null, detalle: null };

  const tokens = n.split(" ");
  const usado = new Array(tokens.length).fill(false);
  const hallados = []; // { id, pos }

  for (const nombre of NOMBRES) {
    const L = nombre.tokens.length;
    for (let i = 0; i + L <= tokens.length; i++) {
      if (usado.slice(i, i + L).some(Boolean)) continue;
      if (nombre.tokens.every((t, j) => tokens[i + j] === t)) {
        for (let j = 0; j < L; j++) usado[i + j] = true;
        hallados.push({ id: nombre.id, pos: i });
      }
    }
  }

  const ids = [...new Set(hallados.sort((a, b) => a.pos - b.pos).map((h) => h.id))];
  const resto = tokens.filter((_, i) => !usado[i]);
  const restoDeVariedad = resto.filter((t) => TOKENS_DE_VARIEDAD.has(t));
  const hayMarcador = resto.some((t) => MARCADORES_CORTE.has(t));
  // Los separadores se buscan en el texto sin normalizar la puntuación.
  const hayaSeparador = SEPARADORES_CORTE.test(
    original.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  );

  const base = { texto: original };

  // Palabras de variedades que no forman un nombre completo: no se adivina.
  if (restoDeVariedad.length) {
    return { ...base, estado: CLASIFICACION.AMBIGUA, ids, detalle: null, sinResolver: restoDeVariedad };
  }
  // Palabras que quedaron fuera de las variedades reconocidas, sin contar
  // marcadores de corte ni conectores. Junto a un separador indican un
  // componente que el catálogo no reconoce («Malbec / Shiraz»).
  const desconocidas = resto.filter((t) => !MARCADORES_CORTE.has(t) && !CONECTORES.has(t));
  if (ids.length >= 2) {
    if (hayaSeparador && desconocidas.length) {
      return { ...base, estado: CLASIFICACION.CORTE, ids, detalle: "componentes_incompletos", noReconocido: desconocidas };
    }
    return { ...base, estado: CLASIFICACION.CORTE, ids, detalle: hayaSeparador || hayMarcador ? "explicito" : "sin_separador" };
  }
  if (ids.length === 1) {
    if (hayMarcador) return { ...base, estado: CLASIFICACION.CORTE, ids, detalle: "componentes_incompletos", noReconocido: desconocidas };
    // Un separador más texto no reconocido no se lee como «Malbec» solo: es
    // un corte cuyo otro componente se desconoce.
    if (hayaSeparador && desconocidas.length) {
      return { ...base, estado: CLASIFICACION.CORTE, ids, detalle: "componentes_incompletos", noReconocido: desconocidas };
    }
    return { ...base, estado: CLASIFICACION.MONOVARIETAL, ids, detalle: resto.length ? "con_texto_adicional" : "exacta" };
  }
  if (hayMarcador) return { ...base, estado: CLASIFICACION.CORTE, ids: [], detalle: "componentes_incompletos" };
  return { ...base, estado: CLASIFICACION.NO_RECONOCIDA, ids: [], detalle: null };
}

// Resuelve el scope_value de un conocimiento de scope 'grape'. El esquema de
// 7.1 solo exige texto no vacío: puede ser un id del catálogo o texto libre.
// Devuelve { id, estado } con id = null si no hay una única variedad.
export function resolverAlcanceVariedad(valor) {
  if (typeof valor !== "string" || !valor.trim()) return { id: null, estado: CLASIFICACION.SIN_DATO };
  if (POR_ID.has(valor)) return { id: valor, estado: CLASIFICACION.MONOVARIETAL };
  const c = clasificarVarietal(valor);
  if (c.estado === CLASIFICACION.MONOVARIETAL && c.detalle === "exacta") return { id: c.ids[0], estado: c.estado };
  return { id: null, estado: c.estado };
}

// Clave estable de bodega. null si no hay dato.
export function claveBodega(texto) {
  const n = normalizarTexto(texto);
  return n || null;
}

// Palabras de los nombres de una variedad (para saber si un varietal ambiguo
// PODRÍA ser esa variedad, p. ej. «Cabernet» frente a Cabernet Franc).
export function tokensDeVariedad(id) {
  return new Set(NOMBRES.filter((n) => n.id === id).flatMap((n) => n.tokens));
}

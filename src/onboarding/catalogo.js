// =============================================================================
// Etapa 7.2-A: catálogo de tipos de vino y de variedades del onboarding.
// Solo datos y funciones puras: sin React, sin Supabase, sin estilos.
// =============================================================================
//
// TIPOS DE VINO (aprobados): los ids son exactamente los valores que acepta
// user_preferences.preferred_wine_types (CHECK de la migración 7.1).
//
// VARIEDADES: ***PROPUESTA PENDIENTE DE VALIDACIÓN DEL DUEÑO DEL PRODUCTO***
// La lista, el orden base, las relevancias por tipo y las seis variedades
// visibles al inicio son una primera versión técnica. Se pueden cambiar sin
// tocar la lógica de abajo. Reglas que sí son fijas:
//   * el `id` es el valor que se guarda en user_preferences.preferred_grapes;
//     es estable: nunca se renombra ni se reutiliza. Para corregir una
//     etiqueta se cambia `etiqueta`, no `id`;
//   * el catálogo solo crece; quitar una variedad equivale a dejar de
//     ofrecerla, no a borrar su id de los datos guardados;
//   * no hay texto libre ni «Blend» como cepa;
//   * `relevancia` solo ordena: ninguna variedad se excluye por tipo.
//     Escala: 2 = típica del tipo, 1 = se usa también, ausente = sin
//     prioridad para ese tipo (sigue disponible).
// =============================================================================

export const TIPOS_VINO = Object.freeze([
  Object.freeze({ id: "tinto", etiqueta: "Tinto" }),
  Object.freeze({ id: "blanco", etiqueta: "Blanco" }),
  Object.freeze({ id: "rosado", etiqueta: "Rosado" }),
  Object.freeze({ id: "naranjo", etiqueta: "Naranjo" }),
  Object.freeze({ id: "espumoso", etiqueta: "Espumoso" }),
]);

export const IDS_TIPOS_VINO = Object.freeze(TIPOS_VINO.map((t) => t.id));

// Orden base = orden de este arreglo. Las seis primeras son las visibles al
// inicio cuando no hay tipos elegidos (ver VARIEDADES_INICIALES).
const DATOS_VARIEDADES = [
  // --- propuesta de seis iniciales ---
  { id: "malbec", etiqueta: "Malbec", relevancia: { tinto: 2, rosado: 2, espumoso: 1 } },
  { id: "cabernet_sauvignon", etiqueta: "Cabernet Sauvignon", relevancia: { tinto: 2 } },
  { id: "pinot_noir", etiqueta: "Pinot Noir", relevancia: { tinto: 2, rosado: 2, espumoso: 2 } },
  { id: "chardonnay", etiqueta: "Chardonnay", relevancia: { blanco: 2, espumoso: 2, naranjo: 1 } },
  { id: "torrontes", etiqueta: "Torrontés", relevancia: { blanco: 2, naranjo: 2, espumoso: 1 } },
  { id: "sauvignon_blanc", etiqueta: "Sauvignon Blanc", relevancia: { blanco: 2, naranjo: 1, espumoso: 1 } },
  // --- resto del catálogo ---
  { id: "cabernet_franc", etiqueta: "Cabernet Franc", relevancia: { tinto: 2, rosado: 1 } },
  { id: "merlot", etiqueta: "Merlot", relevancia: { tinto: 2, rosado: 1 } },
  { id: "syrah", etiqueta: "Syrah", relevancia: { tinto: 2, rosado: 1 } },
  { id: "bonarda", etiqueta: "Bonarda", relevancia: { tinto: 2 } },
  { id: "petit_verdot", etiqueta: "Petit Verdot", relevancia: { tinto: 2 } },
  { id: "tannat", etiqueta: "Tannat", relevancia: { tinto: 2 } },
  { id: "tempranillo", etiqueta: "Tempranillo", relevancia: { tinto: 2, rosado: 1 } },
  { id: "garnacha", etiqueta: "Garnacha", relevancia: { tinto: 2, rosado: 2 } },
  { id: "criolla_chica", etiqueta: "Criolla Chica", relevancia: { tinto: 2, rosado: 1 } },
  { id: "sangiovese", etiqueta: "Sangiovese", relevancia: { tinto: 2 } },
  { id: "semillon", etiqueta: "Semillón", relevancia: { blanco: 2, naranjo: 2 } },
  { id: "chenin_blanc", etiqueta: "Chenin Blanc", relevancia: { blanco: 2, naranjo: 1, espumoso: 1 } },
  { id: "viognier", etiqueta: "Viognier", relevancia: { blanco: 2, naranjo: 1 } },
  { id: "riesling", etiqueta: "Riesling", relevancia: { blanco: 2, naranjo: 1, espumoso: 1 } },
  { id: "pinot_gris", etiqueta: "Pinot Gris / Pinot Grigio", relevancia: { blanco: 2, naranjo: 2, rosado: 1 } },
  { id: "gewurztraminer", etiqueta: "Gewürztraminer", relevancia: { blanco: 2, naranjo: 1 } },
  { id: "pedro_gimenez", etiqueta: "Pedro Giménez", relevancia: { blanco: 2, naranjo: 1 } },
  { id: "moscatel", etiqueta: "Moscatel", relevancia: { blanco: 1, espumoso: 1, naranjo: 1 } },
  { id: "pinot_meunier", etiqueta: "Pinot Meunier", relevancia: { espumoso: 2 } },
  { id: "glera", etiqueta: "Glera", relevancia: { espumoso: 2 } },
];

export const VARIEDADES = Object.freeze(
  DATOS_VARIEDADES.map((v, orden) =>
    Object.freeze({ ...v, orden, relevancia: Object.freeze({ ...v.relevancia }) })
  )
);

export const CANTIDAD_VISIBLE_INICIAL = 6;

export const VARIEDADES_INICIALES = Object.freeze(
  VARIEDADES.slice(0, CANTIDAD_VISIBLE_INICIAL).map((v) => v.id)
);

const POR_ID = new Map(VARIEDADES.map((v) => [v.id, v]));

export function esTipoVinoValido(id) {
  return IDS_TIPOS_VINO.includes(id);
}

export function esVariedadConocida(id) {
  return POR_ID.has(id);
}

export function obtenerVariedad(id) {
  return POR_ID.get(id) || null;
}

// Para mostrar un id guardado. Si el id no está en esta versión del catálogo
// (no debería pasar: el catálogo solo crece), se muestra el id tal cual
// en lugar de perderlo.
export function etiquetaVariedad(id) {
  return POR_ID.get(id)?.etiqueta ?? String(id);
}

// Normaliza una lista de tipos: sin duplicados, en el orden canónico de
// TIPOS_VINO. Devuelve { ok, valor } o { ok: false, error, invalidos }.
export function normalizarTipos(tipos) {
  if (!Array.isArray(tipos)) return { ok: false, error: "Los tipos deben ser una lista.", invalidos: [] };
  const invalidos = tipos.filter((t) => !esTipoVinoValido(t));
  if (invalidos.length) return { ok: false, error: "Tipo de vino no válido.", invalidos };
  const set = new Set(tipos);
  return { ok: true, valor: IDS_TIPOS_VINO.filter((t) => set.has(t)) };
}

// Normaliza una lista de variedades elegidas: sin duplicados, conservando el
// orden en que el usuario las eligió. Solo acepta ids del catálogo (sin
// texto libre). Devuelve { ok, valor } o { ok: false, error, invalidos }.
export function normalizarVariedades(ids) {
  if (!Array.isArray(ids)) return { ok: false, error: "Las variedades deben ser una lista.", invalidos: [] };
  const invalidos = ids.filter((id) => !esVariedadConocida(id));
  if (invalidos.length) return { ok: false, error: "Variedad fuera del catálogo.", invalidos };
  return { ok: true, valor: [...new Set(ids)] };
}

// Prioridad de una variedad para un conjunto de tipos: la mayor relevancia
// entre los tipos elegidos (0 si ninguno la destaca).
export function prioridadVariedad(variedad, tipos) {
  let max = 0;
  for (const t of tipos || []) {
    const r = variedad.relevancia[t] || 0;
    if (r > max) max = r;
  }
  return max;
}

// Organiza el catálogo para la pregunta de variedades.
//
//   tipos         tipos elegidos en la pregunta anterior (puede ser []).
//   seleccionadas ids ya elegidos por el usuario, en su orden.
//   visibles      cuántas sugerencias mostrar antes de «ver más» (6).
//
// Devuelve:
//   seleccionadas  las elegidas, siempre primeras y agrupadas, en el orden en
//                  que se eligieron, aunque los tipos hayan cambiado o
//                  ninguno las priorice. Un id desconocido se conserva
//                  ({ id, etiqueta: id, desconocida: true }).
//   sugeridas      las primeras `visibles` NO elegidas, por prioridad para
//                  los tipos y luego por orden base. Sin tipos: orden base
//                  (las seis iniciales).
//   resto          todas las demás no elegidas, mismo criterio.
// seleccionadas + sugeridas + resto = catálogo completo (+ desconocidas),
// sin repetidos: ninguna variedad queda excluida.
export function organizarVariedades({ tipos = [], seleccionadas = [], visibles = CANTIDAD_VISIBLE_INICIAL } = {}) {
  const elegidas = [...new Set(seleccionadas)];
  const setElegidas = new Set(elegidas);
  const grupoElegidas = elegidas.map(
    (id) => POR_ID.get(id) || Object.freeze({ id, etiqueta: String(id), orden: Infinity, relevancia: {}, desconocida: true })
  );
  const noElegidas = VARIEDADES.filter((v) => !setElegidas.has(v.id))
    .map((v) => ({ v, p: prioridadVariedad(v, tipos) }))
    .sort((a, b) => b.p - a.p || a.v.orden - b.v.orden)
    .map((x) => x.v);
  return {
    seleccionadas: grupoElegidas,
    sugeridas: noElegidas.slice(0, visibles),
    resto: noElegidas.slice(visibles),
  };
}

export const NIVELES_CONOCIMIENTO = Object.freeze([
  Object.freeze({ id: "beginner", etiqueta: "Estoy empezando", descripcion: "Todavía estoy conociendo los distintos vinos" }),
  Object.freeze({ id: "intermediate", etiqueta: "Me gusta el vino" }),
  Object.freeze({ id: "advanced", etiqueta: "Conozco bastante" }),
]);

export const IDS_NIVELES = Object.freeze(NIVELES_CONOCIMIENTO.map((n) => n.id));

export function esNivelValido(id) {
  return IDS_NIVELES.includes(id);
}

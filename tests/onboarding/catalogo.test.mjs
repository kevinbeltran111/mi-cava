// Pruebas unitarias del catálogo de 7.2-A (sin red ni base).
// Ejecutar: node --test tests/onboarding/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS_VINO, IDS_TIPOS_VINO, VARIEDADES, VARIEDADES_INICIALES, CANTIDAD_VISIBLE_INICIAL,
  organizarVariedades, normalizarTipos, normalizarVariedades, etiquetaVariedad,
  prioridadVariedad, NIVELES_CONOCIMIENTO,
} from "../../src/onboarding/catalogo.js";

test("tipos: exactamente los cinco aprobados, con los ids del CHECK de 7.1", () => {
  assert.deepEqual(IDS_TIPOS_VINO, ["tinto", "blanco", "rosado", "naranjo", "espumoso"]);
  assert.deepEqual(TIPOS_VINO.map((t) => t.etiqueta), ["Tinto", "Blanco", "Rosado", "Naranjo", "Espumoso"]);
});

test("variedades: ids únicos, estables (snake_case ASCII), sin Blend ni corte", () => {
  const ids = VARIEDADES.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const v of VARIEDADES) {
    assert.match(v.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(v.etiqueta.trim().length > 0);
    assert.doesNotMatch(`${v.id} ${v.etiqueta}`, /blend|corte|assemblage/i);
    for (const t of Object.keys(v.relevancia)) assert.ok(IDS_TIPOS_VINO.includes(t), `${v.id}: tipo ${t}`);
  }
});

test("seis variedades visibles inicialmente sin tipos elegidos", () => {
  assert.equal(CANTIDAD_VISIBLE_INICIAL, 6);
  assert.equal(VARIEDADES_INICIALES.length, 6);
  const o = organizarVariedades({});
  assert.deepEqual(o.sugeridas.map((v) => v.id), VARIEDADES_INICIALES);
});

test("ninguna variedad se excluye: seleccionadas + sugeridas + resto = catálogo completo", () => {
  for (const tipos of [[], ["tinto"], ["espumoso"], ["blanco", "naranjo"], IDS_TIPOS_VINO]) {
    const o = organizarVariedades({ tipos, seleccionadas: ["glera", "malbec"] });
    const todos = [...o.seleccionadas, ...o.sugeridas, ...o.resto].map((v) => v.id);
    assert.equal(new Set(todos).size, todos.length, "sin repetidos");
    assert.deepEqual([...todos].sort(), VARIEDADES.map((v) => v.id).sort());
  }
});

test("espumoso prioriza variedades pertinentes, sin exclusividad", () => {
  const sug = organizarVariedades({ tipos: ["espumoso"] }).sugeridas.map((v) => v.id);
  for (const id of ["chardonnay", "pinot_noir"]) assert.ok(sug.includes(id), `${id} sugerida para espumoso`);
  // Chardonnay y Pinot Noir también son relevantes para otros estilos
  const chard = VARIEDADES.find((v) => v.id === "chardonnay");
  const pinot = VARIEDADES.find((v) => v.id === "pinot_noir");
  assert.ok(prioridadVariedad(chard, ["blanco"]) > 0);
  assert.ok(prioridadVariedad(pinot, ["tinto"]) > 0 && prioridadVariedad(pinot, ["rosado"]) > 0);
});

test("la prioridad sigue a los tipos: tinto adelante para tinto, blancos para blanco", () => {
  const tinto = organizarVariedades({ tipos: ["tinto"] }).sugeridas;
  assert.ok(tinto.every((v) => (v.relevancia.tinto || 0) === 2));
  const blanco = organizarVariedades({ tipos: ["blanco"] }).sugeridas;
  assert.ok(blanco.every((v) => (v.relevancia.blanco || 0) === 2));
});

test("las elegidas quedan agrupadas primero, en su orden, aunque cambien los tipos", () => {
  const sel = ["glera", "tannat"];
  for (const tipos of [["blanco"], ["tinto"], []]) {
    const o = organizarVariedades({ tipos, seleccionadas: sel });
    assert.deepEqual(o.seleccionadas.map((v) => v.id), sel);
    assert.ok(!o.sugeridas.some((v) => sel.includes(v.id)));
    assert.ok(!o.resto.some((v) => sel.includes(v.id)));
  }
});

test("un id guardado que no está en el catálogo se conserva y se muestra", () => {
  const o = organizarVariedades({ seleccionadas: ["uva_futura"] });
  assert.equal(o.seleccionadas[0].id, "uva_futura");
  assert.equal(o.seleccionadas[0].desconocida, true);
  assert.equal(etiquetaVariedad("uva_futura"), "uva_futura");
  assert.equal(etiquetaVariedad("torrontes"), "Torrontés");
});

test("normalizarTipos: orden canónico, sin duplicados, rechaza inválidos", () => {
  assert.deepEqual(normalizarTipos(["espumoso", "tinto", "tinto"]), { ok: true, valor: ["tinto", "espumoso"] });
  assert.equal(normalizarTipos(["dulce"]).ok, false);
  assert.equal(normalizarTipos("tinto").ok, false);
});

test("normalizarVariedades: sin texto libre, sin duplicados, conserva orden", () => {
  assert.deepEqual(normalizarVariedades(["syrah", "malbec", "syrah"]), { ok: true, valor: ["syrah", "malbec"] });
  assert.equal(normalizarVariedades(["Malbec"]).ok, false, "la etiqueta no es un id");
  assert.equal(normalizarVariedades(["blend"]).ok, false);
  assert.equal(normalizarVariedades([""]).ok, false);
});

test("niveles: tres valores del CHECK de 7.1 y descripción de principiante", () => {
  assert.deepEqual(NIVELES_CONOCIMIENTO.map((n) => n.id), ["beginner", "intermediate", "advanced"]);
  assert.deepEqual(NIVELES_CONOCIMIENTO.map((n) => n.etiqueta), ["Estoy empezando", "Me gusta el vino", "Conozco bastante"]);
  assert.equal(NIVELES_CONOCIMIENTO[0].descripcion, "Todavía estoy conociendo los distintos vinos");
});

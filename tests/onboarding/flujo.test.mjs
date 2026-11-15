// Pruebas unitarias de las reglas del onboarding (7.2-B).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirOnboarding, rolConCava, SELECCION_TIPOS_VACIA, seleccionTiposDesdePreferencias,
  alternarTipo, alternarExploracion, alternarSinPreferencia, respuestaTipos, tiposParaPriorizar,
  alternarEnLista, alternarNivel, cambiosEdicion, lecturaConTiempoLimite, escrituraConTiempoLimite,
  variedadesVisibles,
} from "../../src/onboarding/flujo.js";
import { CARGA } from "../../src/onboarding/preferencias.js";
import { VARIEDADES, organizarVariedades } from "../../src/onboarding/catalogo.js";

const L = (carga, estado) => ({ carga, preferencias: estado ? { estado } : null });

test("decidirOnboarding: nuevos → pantalla, existentes → invitación, viewer → nada", () => {
  assert.equal(rolConCava("viewer"), false);
  assert.equal(rolConCava(undefined), false);
  for (const rol of ["admin", "editor"]) {
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.SIN_REGISTRO), perfilRecienCreado: true }), "pantalla");
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.SIN_REGISTRO), perfilRecienCreado: false }), "invitacion");
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.CON_REGISTRO, "started"), perfilRecienCreado: false }), "invitacion");
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.CON_REGISTRO, "never"), perfilRecienCreado: false }), "invitacion");
    for (const estado of ["completed", "skipped"]) {
      assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.CON_REGISTRO, estado), perfilRecienCreado: true }), "nada", estado);
    }
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.PENDIENTE), perfilRecienCreado: true }), null);
    assert.equal(decidirOnboarding({ rol, lectura: L(CARGA.ERROR), perfilRecienCreado: true }), "nada", "error ≠ mostrar");
  }
  for (const lectura of [L(CARGA.SIN_REGISTRO), L(CARGA.PENDIENTE), L(CARGA.CON_REGISTRO, "never")]) {
    assert.equal(decidirOnboarding({ rol: "viewer", lectura, perfilRecienCreado: true }), "nada");
  }
});

test("tipos: «No tengo preferencia» excluye tipos y probar de todo; se distinguen", () => {
  let s = { ...SELECCION_TIPOS_VACIA };
  s = alternarTipo(s, "espumoso");
  s = alternarTipo(s, "tinto");
  assert.deepEqual(s.tipos, ["tinto", "espumoso"], "orden canónico");
  s = alternarExploracion(s);
  assert.deepEqual(respuestaTipos(s), { respuesta: "answered", tipos: ["tinto", "espumoso"], exploracion: true });
  s = alternarSinPreferencia(s);
  assert.deepEqual(s, { tipos: [], exploracion: false, sinPreferencia: true });
  assert.deepEqual(respuestaTipos(s), { respuesta: "no_preference" });
  s = alternarExploracion(s);
  assert.equal(s.sinPreferencia, false);
  assert.deepEqual(respuestaTipos(s), { respuesta: "answered", tipos: [], exploracion: true });
  s = alternarTipo(alternarSinPreferencia(s), "blanco");
  assert.equal(s.sinPreferencia, false);
  assert.deepEqual(s.tipos, ["blanco"]);
});

test("tipos: continuar sin elegir = pregunta omitida", () => {
  assert.deepEqual(respuestaTipos({ ...SELECCION_TIPOS_VACIA }), { respuesta: "skipped" });
  assert.deepEqual(respuestaTipos(alternarTipo(alternarTipo(SELECCION_TIPOS_VACIA, "tinto"), "tinto")), { respuesta: "skipped" });
});

test("tipos: reanudar desde preferencias guardadas", () => {
  assert.deepEqual(seleccionTiposDesdePreferencias(null), { tipos: [], exploracion: false, sinPreferencia: false });
  assert.deepEqual(seleccionTiposDesdePreferencias({ respuestaTipos: "no_preference", tipos: [], exploracion: false }),
    { tipos: [], exploracion: false, sinPreferencia: true });
  assert.deepEqual(seleccionTiposDesdePreferencias({ respuestaTipos: "answered", tipos: ["rosado"], exploracion: true }),
    { tipos: ["rosado"], exploracion: true, sinPreferencia: false });
  assert.deepEqual(seleccionTiposDesdePreferencias({ respuestaTipos: "skipped", tipos: [], exploracion: false }),
    { tipos: [], exploracion: false, sinPreferencia: false });
});

test("priorizar variedades: solo tipos elegidos", () => {
  assert.deepEqual(tiposParaPriorizar({ tipos: ["espumoso"], exploracion: true, sinPreferencia: false }), ["espumoso"]);
  assert.deepEqual(tiposParaPriorizar({ tipos: [], exploracion: false, sinPreferencia: true }), []);
});

test("variedades y nivel: alternar", () => {
  assert.deepEqual(alternarEnLista(["a"], "b"), ["a", "b"]);
  assert.deepEqual(alternarEnLista(["a", "b"], "a"), ["b"]);
  assert.equal(alternarNivel(null, "beginner"), "beginner");
  assert.equal(alternarNivel("beginner", "beginner"), null);
  assert.equal(alternarNivel("beginner", "advanced"), "advanced");
});

test("cambiosEdicion: solo lo que cambió", () => {
  const base = { seleccionTipos: { tipos: ["tinto"], exploracion: false, sinPreferencia: false }, variedades: ["malbec"], nivel: "beginner" };
  assert.deepEqual(cambiosEdicion(base, structuredClone(base)), {});
  assert.deepEqual(cambiosEdicion(base, { ...structuredClone(base), nivel: null }), { nivel: null });
  assert.deepEqual(cambiosEdicion(base, { ...structuredClone(base), variedades: ["malbec", "syrah"] }), { variedades: ["malbec", "syrah"] });
  assert.deepEqual(cambiosEdicion(base, { ...structuredClone(base), seleccionTipos: { tipos: [], exploracion: false, sinPreferencia: true } }),
    { tipos: { respuesta: "no_preference" } });
});

test("tiempo límite: lectura → ERROR de conexión; escritura → ok:false (nunca éxito)", async () => {
  const nunca = new Promise(() => {});
  const l = await lecturaConTiempoLimite(nunca, 20);
  assert.equal(l.carga, CARGA.ERROR);
  assert.equal(l.error.tipo, "conexion");
  const e = await escrituraConTiempoLimite(nunca, 20);
  assert.equal(e.ok, false);
  const rapido = await lecturaConTiempoLimite(Promise.resolve({ carga: CARGA.SIN_REGISTRO }), 1000);
  assert.equal(rapido.carga, CARGA.SIN_REGISTRO);
});

// -----------------------------------------------------------------------------
// Variedades: modo reducido / completo («Ver más» / «Ver menos variedades»)
// -----------------------------------------------------------------------------
const ids = (r) => r.visibles.map((v) => v.id);
const COMBOS_TIPOS = [[], ["tinto"], ["espumoso"], ["blanco", "naranjo"], ["tinto", "espumoso"], ["rosado"]];

test("variedades: reducido = elegidas + seis sugeridas; completo = catálogo entero, sin duplicados", () => {
  for (const tipos of COMBOS_TIPOS) {
    for (const sel of [[], ["glera"], ["malbec", "tannat"], ["torrontes", "glera", "riesling"]]) {
      const o = organizarVariedades({ tipos, seleccionadas: sel });
      const red = variedadesVisibles({ tipos, seleccionadas: sel, expandido: false });
      const comp = variedadesVisibles({ tipos, seleccionadas: sel, expandido: true });
      assert.deepEqual(ids(red), [...o.seleccionadas, ...o.sugeridas].map((v) => v.id), `${tipos}/${sel}: mismo criterio que organizarVariedades`);
      assert.deepEqual(ids(comp), [...o.seleccionadas, ...o.sugeridas, ...o.resto].map((v) => v.id));
      assert.equal(new Set(ids(red)).size, ids(red).length);
      assert.equal(new Set(ids(comp)).size, ids(comp).length);
      assert.deepEqual([...ids(comp)].sort(), VARIEDADES.map((v) => v.id).sort(), "ninguna excluida");
      assert.deepEqual(ids(red).slice(0, sel.length), sel, "elegidas agrupadas primero (reducido)");
      assert.deepEqual(ids(comp).slice(0, sel.length), sel, "elegidas agrupadas primero (completo)");
      assert.ok(red.hayAlternancia && comp.hayAlternancia);
    }
  }
});

test("variedades: expandir, elegir del resto, contraer y volver a expandir no pierde ni oculta selecciones", () => {
  const tipos = ["espumoso"];
  let sel = [];
  let expandido = false;
  const vista = () => variedadesVisibles({ tipos, seleccionadas: sel, expandido });
  const seis = ids(vista());
  sel = alternarEnLista(sel, seis[0]);
  expandido = true; // Ver más
  const resto = ids(vista()).filter((id) => !seis.includes(id));
  sel = alternarEnLista(sel, resto[resto.length - 1]); // la última del catálogo completo
  sel = alternarEnLista(sel, resto[0]);
  expandido = false; // Ver menos
  const red = ids(vista());
  assert.deepEqual(red.slice(0, 3), sel, "las tres elegidas siguen visibles y agrupadas al contraer");
  for (const id of sel) assert.ok(red.includes(id), id);
  assert.equal(red.length, sel.length + seis.filter((id) => !sel.includes(id)).length);
  expandido = true; // Ver más otra vez
  assert.deepEqual(ids(vista()).slice(0, 3), sel);
  assert.deepEqual(sel.length, 3, "alternar el catálogo no modifica la selección");
});

test("variedades: el modo no cambia la priorización por tipos ni el orden de las sugeridas", () => {
  for (const tipos of COMBOS_TIPOS) {
    const sug = organizarVariedades({ tipos }).sugeridas.map((v) => v.id);
    assert.deepEqual(ids(variedadesVisibles({ tipos, expandido: false })), sug);
    assert.deepEqual(ids(variedadesVisibles({ tipos, expandido: true })).slice(0, 6), sug);
  }
  // Mismos datos → mismo orden (no hay aleatoriedad ni dependencia del historial)
  const a = variedadesVisibles({ tipos: ["tinto"], seleccionadas: ["glera"], expandido: true });
  const b = variedadesVisibles({ tipos: ["tinto"], seleccionadas: ["glera"], expandido: true });
  assert.deepEqual(ids(a), ids(b));
});

test("variedades: alternancia visible solo si hay algo más que mostrar o el catálogo está expandido", () => {
  const todas = VARIEDADES.map((v) => v.id);
  assert.equal(variedadesVisibles({ seleccionadas: todas, expandido: false }).hayAlternancia, false, "todo elegido: nada que ampliar");
  assert.equal(variedadesVisibles({ seleccionadas: todas, expandido: true }).hayAlternancia, true, "expandido: siempre se puede contraer");
  assert.equal(ids(variedadesVisibles({ seleccionadas: todas })).length, todas.length);
});

test("variedades: un id fuera del catálogo se conserva y se muestra en ambos modos", () => {
  for (const expandido of [false, true]) {
    const r = variedadesVisibles({ seleccionadas: ["variedad_retirada", "malbec"], expandido });
    assert.deepEqual(ids(r).slice(0, 2), ["variedad_retirada", "malbec"]);
  }
});

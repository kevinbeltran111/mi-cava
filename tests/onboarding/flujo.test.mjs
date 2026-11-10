// Pruebas unitarias de las reglas del onboarding (7.2-B).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirOnboarding, rolConCava, SELECCION_TIPOS_VACIA, seleccionTiposDesdePreferencias,
  alternarTipo, alternarExploracion, alternarSinPreferencia, respuestaTipos, tiposParaPriorizar,
  alternarEnLista, alternarNivel, cambiosEdicion, lecturaConTiempoLimite, escrituraConTiempoLimite,
} from "../../src/onboarding/flujo.js";
import { CARGA } from "../../src/onboarding/preferencias.js";

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

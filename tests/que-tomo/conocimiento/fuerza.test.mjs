// 7.3-B: mecanismo de fuerza. Sin reglas validadas no se asigna ningún nivel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS_VALIDADAS, validarReglas, evaluarFuerza } from "../../../api/_que-tomo/conocimiento/fuerza.js";
import { extraerEvidencias } from "../../../api/_que-tomo/conocimiento/evidencias.js";
import { agregarPorCepa } from "../../../api/_que-tomo/conocimiento/agregacion.js";
import { contexto, REGLAS_DE_PRUEBA } from "./datos.mjs";

const bloques = (vinos) => agregarPorCepa(extraerEvidencias(contexto({ vinos }))).grupos.find((g) => g.clave === "malbec").bloques;

test("7.3-B no trae reglas validadas: ningún nivel", () => {
  assert.equal(REGLAS_VALIDADAS, null);
  const f = evaluarFuerza(bloques([{ varietal: "Malbec", favorito: true, consumos: [{ puntuacion: 5 }, { puntuacion: 5 }] }]));
  assert.deepEqual(f, { estado: "sin_regla_validada", version: null, positiva: null, negativa: null, mixta: false });
});

test("validación: rechaza reglas que dependen solo de frecuencia de consumo", () => {
  const r = validarReglas({ version: "x", positiva: { indication: [{ indicador: "monovarietal.consumosTotales", op: ">=", valor: 3 }] } });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /frecuencia/);
});

test("validación: 'relevant' y 'strong' exigen dos observaciones independientes", () => {
  const r = validarReglas({ version: "x", positiva: { strong: [{ indicador: "monovarietal.puntuacion.promedio", op: ">=", valor: 4.5 }] } });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /independientes/);
  // diasConConsumo no cuenta como independencia (incluye consumos sin puntuar)
  const r2 = validarReglas({ version: "x", positiva: { relevant: [{ indicador: "monovarietal.favoritos", op: ">=", valor: 1 }, { indicador: "monovarietal.diasConConsumo", op: ">=", valor: 2 }] } });
  assert.equal(r2.ok, false);
});

test("validación: formato, versión, niveles, indicadores y operadores", () => {
  assert.equal(validarReglas({ positiva: {} }).ok, false); // sin versión
  assert.equal(validarReglas({ version: "x", positiva: { muy_fuerte: [] } }).ok, false);
  assert.equal(validarReglas({ version: "x", otra: {} }).ok, false);
  assert.equal(validarReglas({ version: "x", positiva: { indication: [{ indicador: "monovarietal.gusto", op: ">=", valor: 1 }] } }).ok, false);
  assert.equal(validarReglas({ version: "x", positiva: { indication: [{ indicador: "monovarietal.favoritos", op: "~", valor: 1 }] } }).ok, false);
  assert.equal(validarReglas(REGLAS_DE_PRUEBA).ok, true);
  assert.equal(evaluarFuerza({}, { version: "x", positiva: { strong: [] } }).estado, "reglas_invalidas");
});

test("una puntuación aislada no alcanza 'relevant' (con reglas que cumplen el principio)", () => {
  const f = evaluarFuerza(bloques([{ varietal: "Malbec", consumos: [{ puntuacion: 5 }] }]), REGLAS_DE_PRUEBA);
  assert.equal(f.positiva, null);
});

test("consumos frecuentes sin puntuar no producen nivel", () => {
  const f = evaluarFuerza(bloques([{ varietal: "Malbec", consumos: Array.from({ length: 10 }, () => ({ puntuacion: null })) }]), REGLAS_DE_PRUEBA);
  assert.deepEqual([f.positiva, f.negativa], [null, null]);
});

test("evaluación trazable: nivel, versión y valores observados", () => {
  const f = evaluarFuerza(bloques([{ varietal: "Malbec", consumos: [{ puntuacion: 4.5 }, { puntuacion: 5 }] }]), REGLAS_DE_PRUEBA);
  assert.equal(f.estado, "evaluada");
  assert.equal(f.version, "prueba-no-calibrada");
  assert.equal(f.positiva.nivel, "relevant");
  assert.deepEqual(f.positiva.condiciones.map((c) => c.observado), [2, 4.5]);
});

test("señales mixtas sobre el mismo alcance se marcan, no se resuelven", () => {
  const f = evaluarFuerza(bloques([{ varietal: "Malbec", favorito: true, consumos: [{ puntuacion: 1 }] }]), REGLAS_DE_PRUEBA);
  assert.equal(f.positiva.nivel, "indication");
  assert.equal(f.negativa.nivel, "indication");
  assert.equal(f.mixta, true);
});

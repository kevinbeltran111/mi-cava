// 7.3-A: contrato del motor. Se prueba la VALIDACIÓN de la salida, no un motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarSalidaMotor, MOTOR_ACTUAL } from "../../api/_que-tomo/motor.js";
import { representarContexto } from "../../api/_que-tomo/contexto.js";
import { recuperarCandidatos } from "../../api/_que-tomo/candidatos.js";
import { U, W, filasSinteticas } from "./fixtures.mjs";

const { candidatos } = recuperarCandidatos(representarContexto(filasSinteticas(), U));
const rec = (wineId, extra = {}) => ({ wineId, relationship: "owned", explicacion: "explicación de prueba", ...extra });
const base = (recs) => ({ modo: "food", suficiencia: "sufficient", recomendaciones: recs });

test("7.3-A no trae motor", () => {
  assert.equal(MOTOR_ACTUAL, null);
});

test("salida válida: identidad tomada de la base, no del motor", () => {
  const r = validarSalidaMotor(base([rec(W.favorito, { nombre: "Inventado" }), rec(W.tomadoMal, { relationship: "known" })]), candidatos);
  assert.equal(r.ok, true);
  assert.equal(r.valor.recomendaciones.length, 2);
  assert.equal(r.valor.recomendaciones[0].posicion, 1);
  assert.equal(r.valor.recomendaciones[0].candidato.identidad.nombre, "Sintético Uno");
  assert.deepEqual(r.valor.contextoSesion, {});
});

test("lista vacía permitida (contexto insuficiente)", () => {
  const r = validarSalidaMotor({ modo: "cellar", suficiencia: "insufficient", recomendaciones: [] }, candidatos);
  assert.equal(r.ok, true);
});

test("rechaza botellas que no están en la biblioteca", () => {
  const r = validarSalidaMotor(base([rec("99999999-0000-0000-0000-000000000000")]), candidatos);
  assert.equal(r.ok, false);
  assert.match(r.error.mensaje, /biblioteca/);
});

test("rechaza más de tres, duplicados, 'new', 'discovery' y explicación vacía", () => {
  const cuatro = [W.favorito, W.stockSinTomar, W.tomadoMal, W.tomadoSinPuntuar].map((id) => rec(id));
  assert.equal(validarSalidaMotor(base(cuatro), candidatos).ok, false);
  assert.equal(validarSalidaMotor(base([rec(W.favorito), rec(W.favorito)]), candidatos).ok, false);
  assert.equal(validarSalidaMotor(base([rec(W.favorito, { relationship: "new" })]), candidatos).ok, false);
  assert.equal(validarSalidaMotor({ ...base([]), modo: "discovery" }, candidatos).ok, false);
  assert.equal(validarSalidaMotor(base([rec(W.favorito, { explicacion: "  " })]), candidatos).ok, false);
});

test("rechaza formas inválidas", () => {
  for (const s of [null, "texto", [], { modo: "food" }, { ...base([]), suficiencia: "mucha" }, { ...base([]), contextoSesion: [] }]) {
    assert.equal(validarSalidaMotor(s, candidatos).ok, false, JSON.stringify(s));
  }
  assert.equal(validarSalidaMotor(base([rec(W.favorito, { signals: "x" })]), candidatos).ok, false);
});

// 7.4-B1: motor de «Elegir de mi cava» (puro, sin base).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  prepararCellar, motorCellar, explicar, compararConfianza, claveConfianza,
  UMBRAL_BUENA_PUNTUACION, MOTIVOS_SIN_CANDIDATOS, VERSION_MOTOR_CELLAR,
} from "../../api/_que-tomo/motor_cellar.js";
import { MOTOR_ACTUAL, validarSalidaMotor } from "../../api/_que-tomo/motor.js";
import { contextoDe, v } from "./escenarios_cellar.mjs";

function correr(opciones) {
  const prep = prepararCellar(contextoDe(opciones));
  assert.equal(prep.ok, true);
  if (prep.sinCandidatos) return { prep, salida: null };
  const salida = motorCellar({ ...prep.entrada, consulta: null });
  return { prep, salida };
}
const ids = (salida) => salida.recomendaciones.map((r) => r.wineId);
const rec = (salida, id) => salida.recomendaciones.find((r) => r.wineId === id);

test("el motor vigente es el de la cava", () => {
  assert.equal(MOTOR_ACTUAL, motorCellar);
});

test("selección: solo stock > 0 y sin restricción confirmada; una opción por vino aunque haya varias unidades", () => {
  const { prep, salida } = correr({
    vinos: [
      { id: v(1), varietal: "Malbec", stock: 6 },
      { id: v(2), varietal: "Syrah", stock: 0, puntuaciones: [5] },
      { id: v(3), varietal: "Merlot" }, // sin fila de stock
      { id: v(4), varietal: "Malbec", stock: 2, favorito: true },
      { id: v(5), varietal: "Bonarda", stock: 1 },
    ],
    conocimiento: [{ knowledge_type: "restriction", scope_type: "grape", scope_value: "malbec", meaning: "no me recomiendes Malbec" }],
  });
  assert.deepEqual(prep.entrada.candidatos.map((c) => c.wineId), [v(5)]);
  assert.deepEqual(ids(salida), [v(5)]);
});

test("motivos sin candidatos", () => {
  assert.equal(correr({ vinos: [] }).prep.sinCandidatos.motivo, MOTIVOS_SIN_CANDIDATOS.BIBLIOTECA_VACIA);
  assert.equal(correr({ vinos: [{ id: v(1), stock: 0 }, { id: v(2) }] }).prep.sinCandidatos.motivo, MOTIVOS_SIN_CANDIDATOS.SIN_STOCK);
  const r = correr({
    vinos: [{ id: v(1), varietal: "Malbec", stock: 3 }, { id: v(2), stock: 0 }],
    conocimiento: [{ knowledge_type: "restriction", scope_type: "wine", wine_id: v(1), wine_snapshot: { nombre: "Vino 1" }, meaning: "no me lo recomiendes" }],
  });
  assert.deepEqual(r.prep.sinCandidatos, { motivo: MOTIVOS_SIN_CANDIDATOS.EXCLUIDOS, excluidosPorRestriccion: 1, excluidosPorFiltro: 0 });
});

test("cantidad: 1, 2 y 3 o más vinos elegibles", () => {
  for (const n of [1, 2, 3, 6]) {
    const vinos = Array.from({ length: n }, (_, i) => ({ id: v(i + 1), varietal: "Merlot", stock: 1 }));
    const { salida } = correr({ vinos });
    assert.equal(salida.recomendaciones.length, Math.min(n, 3), `n=${n}`);
    assert.deepEqual(salida.recomendaciones.map((r) => r.signals.rol), ["principal", "alternativa", "alternativa"].slice(0, Math.min(n, 3)));
  }
});

test("prioridad de confianza: favorito > buena puntuación > sin puntuar > baja puntuación", () => {
  const { salida, prep } = correr({
    preferencias: null,
    vinos: [
      { id: v(1), stock: 1, puntuaciones: [2] }, // baja
      { id: v(2), stock: 1 }, // sin puntuar
      { id: v(3), stock: 1, puntuaciones: [4.5] }, // buena
      { id: v(4), stock: 1, favorito: true, puntuaciones: [3] }, // favorito (con puntuación baja)
    ],
  });
  const orden = [...prep.entrada.candidatos].sort(compararConfianza).map((c) => c.wineId);
  assert.deepEqual(orden, [v(4), v(3), v(2), v(1)]);
  assert.deepEqual(ids(salida), [v(4), v(3), v(2)]);
});

test(`umbral de buena puntuación = ${UMBRAL_BUENA_PUNTUACION}: 4 es buena, 3,5 no`, () => {
  const { salida } = correr({
    preferencias: null,
    vinos: [{ id: v(1), stock: 1, puntuaciones: [3.5] }, { id: v(2), stock: 1 }, { id: v(3), stock: 1, puntuaciones: [4] }],
  });
  assert.deepEqual(ids(salida), [v(3), v(2), v(1)]);
});

test("empates: promedio mayor, luego más experiencias puntuadas, luego orden neutral (más reciente)", () => {
  const { salida } = correr({
    preferencias: null,
    vinos: [
      { id: v(1), stock: 1, puntuaciones: [4.5], created_at: "2026-10-20T00:00:00Z" },
      { id: v(2), stock: 1, puntuaciones: [4.5, 4.5], created_at: "2026-10-01T00:00:00Z" },
      { id: v(3), stock: 1, puntuaciones: [5], created_at: "2026-09-01T00:00:00Z" },
    ],
  });
  assert.deepEqual(ids(salida), [v(3), v(2), v(1)]);

  // Empate total: decide el orden neutral (agregado más recientemente primero; a igual fecha, id).
  const t = correr({
    preferencias: null,
    vinos: [
      { id: v(7), stock: 1, created_at: "2026-10-01T00:00:00Z" },
      { id: v(9), stock: 1, created_at: "2026-10-05T00:00:00Z" },
      { id: v(8), stock: 1, created_at: "2026-10-05T00:00:00Z" },
    ],
  });
  assert.deepEqual(ids(t.salida), [v(8), v(9), v(7)]);
  // Determinismo: misma entrada, misma salida.
  assert.deepEqual(correr({ preferencias: null, vinos: [{ id: v(2), stock: 1 }, { id: v(1), stock: 1 }] }).salida,
    correr({ preferencias: null, vinos: [{ id: v(2), stock: 1 }, { id: v(1), stock: 1 }] }).salida);
});

test("exploración: entra como alternativa aunque esté más abajo en confianza, marcada y en orden de confianza", () => {
  const { salida } = correr({
    vinos: [
      { id: v(1), varietal: "Malbec", stock: 1, favorito: true, puntuaciones: [5] },
      { id: v(2), varietal: "Merlot", stock: 1, puntuaciones: [4.5] },
      { id: v(3), varietal: "Syrah", stock: 1, puntuaciones: [4] },
      { id: v(4), varietal: "Cabernet Franc", stock: 3 }, // declarada, sin experiencias
    ],
  });
  assert.deepEqual(ids(salida), [v(1), v(2), v(4)]);
  assert.equal(rec(salida, v(4)).signals.exploracion, true);
  assert.deepEqual(salida.recomendaciones.filter((r) => r.signals.exploracion).length, 1);
  assert.equal(rec(salida, v(4)).explicacion,
    "Es un Cabernet Franc, una de las variedades que elegiste en tus preferencias. Todavía no registraste experiencias con este vino.");
});

test("exploración: no aplica con experiencias registradas (aun sin puntuar), cortes, texto adicional ni variedad no declarada", () => {
  const base = [
    { id: v(1), varietal: "Malbec", stock: 1, favorito: true },
    { id: v(2), varietal: "Merlot", stock: 1, puntuaciones: [4.5] },
    { id: v(3), varietal: "Syrah", stock: 1, puntuaciones: [4] },
  ];
  for (const extra of [
    { id: v(4), varietal: "Cabernet Franc", stock: 1, puntuaciones: [null] },
    { id: v(4), varietal: "Cabernet Franc - Malbec", stock: 1 },
    { id: v(4), varietal: "Cabernet Franc Reserva", stock: 1 },
    { id: v(4), varietal: "Bonarda", stock: 1 },
  ]) {
    const { salida } = correr({ vinos: [...base, extra] });
    assert.deepEqual(ids(salida), [v(1), v(2), v(3)], extra.varietal);
    assert.equal(salida.recomendaciones.some((r) => r.signals.exploracion), false);
  }
});

test("exploración: si la candidata es la principal, no se busca otra marca para ella", () => {
  const { salida } = correr({ vinos: [{ id: v(1), varietal: "Pinot Noir", stock: 1 }, { id: v(2), varietal: "Merlot", stock: 1 }] });
  assert.deepEqual(ids(salida), [v(1), v(2)]);
  assert.equal(rec(salida, v(1)).signals.exploracion, false);
  assert.equal(rec(salida, v(1)).signals.rol, "principal");
});

test("explicaciones: textos exactos y cada afirmación respaldada por los datos", () => {
  const { salida, prep } = correr({
    vinos: [
      { id: v(1), varietal: "Cabernet Franc", stock: 2, favorito: true, puntuaciones: [4.5, 5] },
      { id: v(2), varietal: "Merlot", stock: 1, puntuaciones: [4] },
      { id: v(3), varietal: "Syrah", stock: 1, puntuaciones: [null, null] },
    ],
  });
  assert.equal(rec(salida, v(1)).explicacion,
    "Lo marcaste como favorito. Lo puntuaste con 4,75 estrellas en promedio, en 2 experiencias. Es un Cabernet Franc, una de las variedades que elegiste en tus preferencias.");
  assert.equal(rec(salida, v(2)).explicacion, "Lo puntuaste con 4 estrellas.");
  assert.equal(rec(salida, v(3)).explicacion, "Registraste 2 experiencias con este vino, sin puntuación.");

  const porId = new Map(prep.entrada.candidatos.map((c) => [c.wineId, c]));
  for (const r of salida.recomendaciones) {
    const c = porId.get(r.wineId);
    assert.equal(r.explicacion, explicar(r.grounding.afirmaciones), "el texto sale solo del grounding");
    for (const a of r.grounding.afirmaciones) {
      if (a.tipo === "favorito") assert.equal(c.favorito, true);
      if (a.tipo === "puntuacion") assert.deepEqual([a.promedio, a.experiencias], [c.valoracion.promedio, c.valoracion.puntuadas]);
      if (a.tipo === "experiencias_sin_puntuar") assert.equal(a.experiencias, c.valoracion.sinPuntuar);
      if (a.tipo === "variedad_declarada") assert.deepEqual(c.variedad.ids, [a.variedad]);
      if (a.tipo === "sin_experiencias_registradas") assert.equal(c.historial.veces, 0);
      if (a.tipo === "disponibilidad") assert.equal(a.stock, c.disponibilidad.stock);
    }
    assert.doesNotMatch(r.explicacion, /nunca|precio|\$/i);
  }
});

test("explicación con datos mínimos: solo disponibilidad", () => {
  const { salida } = correr({ preferencias: null, vinos: [{ id: v(1), stock: 1 }, { id: v(2), varietal: "Merlot", stock: 4 }] });
  assert.equal(rec(salida, v(1)).explicacion, "Está disponible en tu cava: tenés 1 botella.");
  assert.equal(rec(salida, v(2)).explicacion, "Está disponible en tu cava: tenés 4 botellas.");
});

test("el precio no interviene: cambiarlo no altera el resultado", () => {
  const vinos = (p) => [
    { id: v(1), varietal: "Merlot", stock: 1, precio: p[0], puntuaciones: [4] },
    { id: v(2), varietal: "Cabernet Franc", stock: 1, precio: p[1] },
    { id: v(3), varietal: "Syrah", stock: 1, precio: p[2], favorito: true },
    { id: v(4), varietal: "Bonarda", stock: 1, precio: p[3] },
  ];
  const a = correr({ vinos: vinos([1000, 2000, 3000, 4000]) });
  const b = correr({ vinos: vinos([90000, null, 5, 120000]) });
  assert.deepEqual(a.salida, b.salida);
  assert.equal(JSON.stringify(a.prep.entrada).includes("precio"), false, "el motor no recibe precios");
});

test("la salida pasa el validador de 7.3-A contra los candidatos elegibles y no contra otros", () => {
  const { prep, salida } = correr({
    vinos: [{ id: v(1), varietal: "Merlot", stock: 1 }, { id: v(2), varietal: "Syrah", stock: 0, puntuaciones: [5] }],
  });
  const val = validarSalidaMotor(salida, prep.entrada.candidatos);
  assert.equal(val.ok, true, JSON.stringify(val.error));
  assert.equal(salida.engineVersion, VERSION_MOTOR_CELLAR);
  assert.equal(salida.model, null);
  assert.equal(salida.recomendaciones.every((r) => r.relationship === "owned"), true);
  // un vino sin stock no es válido aunque sea de la biblioteca
  const conSinStock = { ...salida, recomendaciones: [{ wineId: v(2), relationship: "owned", explicacion: "x" }] };
  assert.equal(validarSalidaMotor(conSinStock, prep.entrada.candidatos).ok, false);
});

test("modo distinto de cellar: el motor no devuelve una salida válida", () => {
  const r = motorCellar({ modo: "food", candidatos: [] });
  assert.equal(r.ok, false);
});

test("claveConfianza documenta el criterio usado en signals", () => {
  const { salida } = correr({ preferencias: null, vinos: [{ id: v(1), stock: 1, favorito: true, puntuaciones: [4.5] }] });
  assert.deepEqual(salida.recomendaciones[0].signals.orden, { favorito: 1, grupoPuntuacion: 2, promedio: 4.5, puntuadas: 1, ordenNeutral: 0 });
  assert.equal(typeof claveConfianza, "function");
});

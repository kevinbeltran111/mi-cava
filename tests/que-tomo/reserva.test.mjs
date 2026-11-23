// 7.4-B3: reserva «para una ocasión especial» — marca, id determinista y
// reconocimiento en la selección (puro, sin base).
import { test } from "node:test";
import assert from "node:assert/strict";
import { esReserva, idReserva, filaReserva, MARCA_RESERVA, SIGNIFICADO_RESERVA } from "../../api/_que-tomo/conocimiento/reserva.js";
import { prepararCellar, motorCellar, MOTIVOS_SIN_CANDIDATOS } from "../../api/_que-tomo/motor_cellar.js";
import { contextoDe, v, U } from "./escenarios_cellar.mjs";

const reservaDe = (wineId, extra = {}) => ({
  knowledge_type: "explicit", scope_type: "wine", wine_id: wineId, wine_snapshot: { nombre: "x" },
  meaning: SIGNIFICADO_RESERVA, value: { ...MARCA_RESERVA }, source_type: "recommender", ...extra,
});

test("marca en value: { marca: 'reserva', motivo: 'ocasion_especial', version: 1 }", () => {
  assert.deepEqual(MARCA_RESERVA, { marca: "reserva", motivo: "ocasion_especial", version: 1 });
  assert.equal(esReserva({ marca: "reserva", motivo: "ocasion_especial", version: 1 }), true);
  for (const x of [null, undefined, {}, [], "reserva", { marca: "reserva" }, { marca: "reserva", version: 2 }, { marca: "otra", version: 1 }]) {
    assert.equal(esReserva(x), false, JSON.stringify(x));
  }
});

test("id determinista (UUID v5) por usuario y vino, sin distinguir mayúsculas", () => {
  const a = idReserva(U, v(1));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(idReserva(U.toUpperCase(), v(1).toUpperCase()), a);
  assert.notEqual(idReserva(U, v(2)), a);
  assert.notEqual(idReserva("00000000-0000-0000-0000-0000000000ff", v(1)), a);
  // Vector calculado con uuid.uuid5 de Python sobre el mismo espacio de nombres.
  assert.equal(idReserva("00000000-0000-0000-0000-0000000074d1", "f4000000-0000-0000-0000-0000000000d2"), "7902a2ee-5436-5f32-b3e0-021c1acf3299");
});

test("fila de la reserva: explicit / wine / recommender, activa, sin fuerza; el stock no aparece", () => {
  const f = filaReserva({ userId: U, wineId: v(1), identidad: { nombre: "Malbec" }, evidencia: { origen: "elegir_de_mi_cava" } });
  assert.deepEqual(f, {
    id: idReserva(U, v(1)), user_id: U, knowledge_type: "explicit", scope_type: "wine", scope_value: null, wine_id: v(1),
    wine_snapshot: { nombre: "Malbec" }, meaning: SIGNIFICADO_RESERVA, value: MARCA_RESERVA, strength: null,
    source_type: "recommender", evidence: { origen: "elegir_de_mi_cava" }, status: "active",
  });
});

test("la selección excluye el vino reservado (origen reserva) y solo ese", () => {
  const prep = prepararCellar(contextoDe({
    vinos: [{ id: v(1), varietal: "Malbec", stock: 2, favorito: true }, { id: v(2), varietal: "Malbec", stock: 1 }],
    conocimiento: [reservaDe(v(1))],
  }));
  assert.deepEqual(prep.entrada.candidatos.map((c) => c.wineId), [v(2)], "el otro Malbec sigue elegible");
  assert.equal(prep.entrada.candidatos[0].coincidenciasInciertas.length, 0);
});

test("solo cuenta la marca en value: el mismo texto en meaning sin marca no excluye", () => {
  const prep = prepararCellar(contextoDe({
    vinos: [{ id: v(1), stock: 1 }],
    conocimiento: [reservaDe(v(1), { value: null }), reservaDe(v(1), { value: { marca: "reserva", version: 9 } })],
  }));
  assert.deepEqual(prep.entrada.candidatos.map((c) => c.wineId), [v(1)]);
});

test("último vino disponible reservado → excluidos_por_reserva (no sin_stock)", () => {
  const prep = prepararCellar(contextoDe({
    vinos: [{ id: v(1), stock: 1 }, { id: v(2), stock: 0 }],
    conocimiento: [reservaDe(v(1))],
  }));
  assert.deepEqual(prep.sinCandidatos, { motivo: MOTIVOS_SIN_CANDIDATOS.EXCLUIDOS_POR_RESERVA, excluidosPorRestriccion: 0, excluidosPorFiltro: 0, excluidosPorReserva: 1 });
});

test("motivo con filtros y reservas a la vez: decide la prioridad; la restricción persistente no es levantable", () => {
  const opciones = {
    vinos: [{ id: v(1), varietal: "Malbec", stock: 1 }, { id: v(2), varietal: "Syrah", stock: 1 }, { id: v(3), varietal: "Merlot", stock: 1 }],
    conocimiento: [
      reservaDe(v(2)),
      { knowledge_type: "restriction", scope_type: "grape", scope_value: "merlot", meaning: "no me recomiendes Merlot" },
    ],
  };
  const temporal = { restricciones: [{ alcance: { tipo: "grape", valor: "malbec" } }] };
  const conFiltroPrimero = prepararCellar(contextoDe(opciones), { temporal });
  const conReservaPrimero = prepararCellar(contextoDe(opciones), { temporal, prioridad: ["reserva", "temporal"] });
  assert.equal(conFiltroPrimero.sinCandidatos.motivo, "excluidos_por_filtro");
  assert.equal(conReservaPrimero.sinCandidatos.motivo, "excluidos_por_reserva");
  assert.deepEqual(conReservaPrimero.sinCandidatos, { motivo: "excluidos_por_reserva", excluidosPorRestriccion: 1, excluidosPorFiltro: 1, excluidosPorReserva: 1 });
  // Vino reservado Y alcanzado por una restricción persistente: no es levantable.
  const soloPersistente = prepararCellar(contextoDe({
    vinos: [{ id: v(3), varietal: "Merlot", stock: 1 }],
    conocimiento: [reservaDe(v(3)), opciones.conocimiento[1]],
  }));
  assert.equal(soloPersistente.sinCandidatos.motivo, "excluidos_por_restriccion");
});

test("la reserva no cambia el orden ni las explicaciones de los demás vinos", () => {
  const vinos = [
    { id: v(1), varietal: "Merlot", stock: 1, favorito: true, puntuaciones: [4.5] },
    { id: v(2), varietal: "Syrah", stock: 1, puntuaciones: [4] },
    { id: v(3), varietal: "Cabernet Franc", stock: 1 },
    { id: v(4), varietal: "Bonarda", stock: 1 },
  ];
  const sin = motorCellar({ ...prepararCellar(contextoDe({ vinos: vinos.filter((w) => w.id !== v(1)) })).entrada, consulta: null });
  const con = motorCellar({ ...prepararCellar(contextoDe({ vinos, conocimiento: [reservaDe(v(1))] })).entrada, consulta: null });
  assert.deepEqual(con.recomendaciones.map((r) => [r.wineId, r.explicacion]), sin.recomendaciones.map((r) => [r.wineId, r.explicacion]));
});

// 7.3-A: representación del contexto personal y candidatos (funciones puras).
import { test } from "node:test";
import assert from "node:assert/strict";
import { representarContexto, leerDatosPersonales } from "../../api/_que-tomo/contexto.js";
import { recuperarCandidatos } from "../../api/_que-tomo/candidatos.js";
import { U, W, filasSinteticas } from "./fixtures.mjs";

const ctx = () => representarContexto(filasSinteticas(), U);
const vino = (c, id) => c.biblioteca.find((v) => v.id === id);

test("separa preferencias declaradas, explícitas, restricciones e inferencias", () => {
  const c = ctx();
  assert.equal(c.usuarioId, U);
  assert.equal(c.preferencias.declaradas.registrada, true);
  assert.deepEqual(c.preferencias.declaradas.tipos, { respuesta: "answered", elegidos: ["tinto"], exploracion: true });
  assert.deepEqual(c.preferencias.declaradas.variedades, ["malbec", "cabernet_franc"]);
  assert.deepEqual(c.preferencias.explicitas.map((k) => k.id), ["k1"]);
  assert.deepEqual(c.restricciones.map((k) => k.id), ["k2"]);
  assert.deepEqual(c.inferencias.map((k) => k.id), ["k3"]);
  // La inferencia conserva su evidencia tal cual.
  assert.deepEqual(c.inferencias[0].evidencia, { consumos: ["c1", "c2"] });
  assert.equal(c.inferencias[0].fuente, "behavior");
});

test("sin fila de preferencias: registrada=false, no se inventan preferencias", () => {
  const f = filasSinteticas();
  f.preferencias = null;
  f.conocimiento = [];
  const c = representarContexto(f, U);
  assert.deepEqual(c.preferencias.declaradas, { registrada: false });
  assert.deepEqual(c.preferencias.explicitas, []);
  assert.deepEqual(c.inferencias, []);
});

test("'no_preference' no se convierte en exploración ni en tipos", () => {
  const f = filasSinteticas();
  Object.assign(f.preferencias, { wine_types_answer: "no_preference", preferred_wine_types: [], exploration_open: false });
  const t = representarContexto(f, U).preferencias.declaradas.tipos;
  assert.deepEqual(t, { respuesta: "no_preference", elegidos: [], exploracion: false });
});

test("stock es disponibilidad, no agrado", () => {
  const v = vino(ctx(), W.stockSinTomar);
  assert.deepEqual(v.hechos.disponibilidad, { stock: 6, disponible: true, registrada: true });
  assert.equal(v.senales.favorito, false);
  assert.equal(v.senales.consumo.veces, 0);
  assert.equal(v.senales.valoracion.promedio, null);
  // Ningún campo de señales deriva del stock.
  assert.equal(JSON.stringify(v.senales).includes("6"), false);
});

test("consumo no es satisfacción: sin puntuación el promedio es null, no 0", () => {
  const v = vino(ctx(), W.tomadoSinPuntuar);
  assert.equal(v.senales.consumo.veces, 1);
  assert.deepEqual(v.senales.valoracion, { puntuadas: 0, sinPuntuar: 1, promedio: null });
});

test("consumos mixtos: solo las experiencias puntuadas forman el promedio", () => {
  const v = vino(ctx(), W.tomadoMal);
  assert.equal(v.senales.consumo.veces, 2);
  assert.deepEqual(v.senales.valoracion, { puntuadas: 1, sinPuntuar: 1, promedio: 1.5 });
  assert.equal(v.hechos.disponibilidad.disponible, false);
  // Más reciente primero.
  assert.deepEqual(v.senales.experiencias.map((e) => e.id), ["c4", "c3"]);
});

test("favorito con experiencias: señal explícita y valoración separadas", () => {
  const v = vino(ctx(), W.favorito);
  assert.equal(v.senales.favorito, true);
  assert.deepEqual(v.senales.valoracion, { puntuadas: 2, sinPuntuar: 0, promedio: 4.75 });
  assert.equal(v.senales.consumo.ultimaFecha, "2026-11-01T21:00:00Z");
  assert.deepEqual(v.conocimientoAsociado, ["k3"]);
});

test("precio histórico y origen con cautela", () => {
  const v = vino(ctx(), W.favorito);
  assert.deepEqual(v.hechos.precioPagado, { valor: 18000, naturaleza: "historico" });
  assert.deepEqual(v.hechos.origen, { lugar: "Luján de Cuyo", region: "Mendoza", verificado: false });
  assert.equal(vino(ctx(), W.stockSinTomar).hechos.precioPagado, null);
});

test("vino sin fila privada: stock 0, disponibilidad no registrada, no favorito", () => {
  const v = vino(ctx(), W.sinPrivado);
  assert.deepEqual(v.hechos.disponibilidad, { stock: 0, disponible: false, registrada: false });
  assert.equal(v.senales.favorito, false);
});

test("candidatos: toda la biblioteca, orden neutral (más reciente primero), sin filtrar", () => {
  const { candidatos, resumen } = recuperarCandidatos(ctx());
  assert.deepEqual(candidatos.map((c) => c.wineId), [W.stockSinTomar, W.favorito, W.tomadoMal, W.tomadoSinPuntuar, W.sinPrivado]);
  assert.deepEqual(resumen, { total: 5, disponibles: 2, consumidosAntes: 3, favoritos: 1 });
  const dos = candidatos.find((c) => c.wineId === W.stockSinTomar);
  assert.equal(dos.disponibilidad.disponible, true);
  assert.equal(dos.historial.consumidoAntes, false);
  assert.equal(dos.favorito, false);
  assert.equal(dos.valoracion.promedio, null);
  assert.deepEqual(dos.identidad, { nombre: "Sintético Dos", bodega: "Bodega B", varietal: "Cabernet Franc", anada: 2021, lugar: null, region: null });
});

test("biblioteca vacía: sin candidatos", () => {
  const f = filasSinteticas();
  f.vinos = []; f.privados = []; f.consumos = [];
  const { candidatos, resumen } = recuperarCandidatos(representarContexto(f, U));
  assert.deepEqual(candidatos, []);
  assert.equal(resumen.total, 0);
});

test("leerDatosPersonales: un error de lectura no se convierte en «sin datos»", async () => {
  const consulta = {
    select() { return this; }, eq() { return this; }, order() { return this; },
    range: async () => ({ data: null, error: { code: "42501", message: "denied" } }),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const client = { from: () => Object.create(consulta) };
  const r = await leerDatosPersonales(client, U);
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "permiso");
});

test("leerDatosPersonales: una falla de red es error de conexión", async () => {
  const client = { from: () => { throw new TypeError("fetch failed"); } };
  const r = await leerDatosPersonales(client, U);
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "conexion");
});

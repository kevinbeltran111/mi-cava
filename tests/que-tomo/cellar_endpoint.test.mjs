// 7.4-B1: recorrido completo de POST /api/que-tomo con modo "cellar", sobre
// un doble de Supabase en memoria (sin red ni base). La versión con
// PostgreSQL + PostgREST reales está en que_tomo.integracion.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "../../api/que-tomo.js";
import { motorCellar, explicar } from "../../api/_que-tomo/motor_cellar.js";
import { crearBase, resFalsa, ENTORNO } from "./supabase_en_memoria.mjs";

const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PREF = {
  onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"],
  exploration_open: true, preferred_grapes: ["cabernet_franc"], knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z",
};
const AUTH = { authorization: "Bearer token-bueno" };

async function llamar(escenario, body = { modo: "cellar" }) {
  const base = crearBase(escenario);
  const llamadas = [];
  const motor = (entrada) => { llamadas.push(entrada); return motorCellar(entrada); };
  const res = resFalsa();
  await crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor })({ method: "POST", headers: AUTH, body }, res);
  return { res, base, llamadas };
}
const tablasEscritas = (base) => [...new Set(base.escrituras.map((e) => e.tabla))].sort();

function sinCandidatos({ res, base, llamadas }, motivo) {
  assert.equal(res.codigo, 200);
  assert.equal(res.cuerpo.estado, "sin_candidatos");
  assert.equal(res.cuerpo.motivo, motivo);
  assert.deepEqual(res.cuerpo.recomendaciones, []);
  assert.equal(llamadas.length, 0, "no se invoca el motor");
  assert.deepEqual(base.escrituras, [], "no se crea sesión");
}

test("0 elegibles: biblioteca vacía → sin_candidatos biblioteca_vacia", async () => {
  sinCandidatos(await llamar({ vinos: [] }), "biblioteca_vacia");
});

test("0 elegibles: sin stock → sin_candidatos sin_stock", async () => {
  sinCandidatos(await llamar({ vinos: [{ id: v(1), nombre: "Tomado", stock: 0, puntuaciones: [5] }, { id: v(2), nombre: "Sin fila de stock" }] }), "sin_stock");
});

test("0 elegibles: todo lo disponible lo excluye una restricción confirmada → excluidos_por_restriccion", async () => {
  const r = await llamar({
    preferencias: PREF,
    vinos: [{ id: v(1), nombre: "Malbec con stock", varietal: "Malbec", stock: 4 }, { id: v(2), nombre: "Sin stock", varietal: "Merlot", stock: 0 }],
    conocimiento: [{ id: "k1", knowledge_type: "restriction", scope_type: "grape", scope_value: "malbec", meaning: "no me recomiendes Malbec" }],
  });
  sinCandidatos(r, "excluidos_por_restriccion");
  assert.equal(r.res.cuerpo.biblioteca.excluidosPorRestriccion, 1);
});

test("1, 2 y 3 o más elegibles: 1, 2 y 3 recomendaciones registradas como tanda 1", async () => {
  for (const n of [1, 2, 3, 5]) {
    const vinos = Array.from({ length: n }, (_, i) => ({ id: v(i + 1), nombre: `Vino ${i + 1}`, varietal: "Merlot", stock: 1 }));
    const { res, base, llamadas } = await llamar({ preferencias: PREF, vinos });
    const k = Math.min(n, 3);
    assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
    assert.equal(res.cuerpo.estado, "ok");
    assert.equal(res.cuerpo.tanda, 1);
    assert.equal(res.cuerpo.recomendaciones.length, k, `n=${n}`);
    assert.deepEqual(res.cuerpo.recomendaciones.map((r) => r.rol), ["principal", "alternativa", "alternativa"].slice(0, k));
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].candidatos.length, n);
    const items = base.tablas.recommendation_items;
    assert.deepEqual(items.map((i) => [i.batch_no, i.position]), Array.from({ length: k }, (_, i) => [1, i + 1]));
    assert.equal(base.tablas.recommendation_sessions.length, 1);
    assert.equal(base.tablas.recommendation_sessions[0].mode, "cellar");
  }
});

test("varias unidades del mismo vino cuentan como una sola opción", async () => {
  const { res } = await llamar({ preferencias: PREF, vinos: [{ id: v(1), nombre: "Seis botellas", varietal: "Merlot", stock: 6 }, { id: v(2), nombre: "Sin stock", stock: 0 }] });
  assert.equal(res.cuerpo.recomendaciones.length, 1);
  assert.equal(res.cuerpo.recomendaciones[0].stock, 6);
});

test("restricción confirmada: el vino excluido no llega al motor ni a la respuesta", async () => {
  const { res, llamadas } = await llamar({
    preferencias: PREF,
    vinos: [
      { id: v(1), nombre: "Malbec favorito", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [5] },
      { id: v(2), nombre: "Merlot", varietal: "Merlot", stock: 1 },
      { id: v(3), nombre: "Syrah", varietal: "Syrah", stock: 1 },
    ],
    conocimiento: [{ id: "k1", knowledge_type: "restriction", scope_type: "grape", scope_value: "malbec", meaning: "no me recomiendes Malbec" }],
  });
  assert.deepEqual(llamadas[0].candidatos.map((c) => c.wineId).sort(), [v(2), v(3)]);
  assert.equal(res.cuerpo.recomendaciones.some((r) => r.wineId === v(1)), false);
  assert.equal(res.cuerpo.recomendaciones.length, 2);
});

test("el motor recibe solo candidatos elegibles: sin contexto, biblioteca ni precios", async () => {
  const { llamadas } = await llamar({
    preferencias: PREF,
    vinos: [{ id: v(1), nombre: "Con stock", stock: 1, precio: 25000 }, { id: v(2), nombre: "Sin stock", stock: 0, precio: 9000, puntuaciones: [5] }],
  });
  const e = llamadas[0];
  assert.deepEqual(Object.keys(e).sort(), ["candidatos", "consulta", "modo", "preferencias"]);
  assert.equal(e.modo, "cellar");
  assert.equal(e.consulta, null);
  assert.deepEqual(e.candidatos.map((c) => c.wineId), [v(1)]);
  const texto = JSON.stringify(e);
  assert.equal(texto.includes(v(2)), false);
  assert.equal(texto.includes("25000") || texto.includes("precio"), false);
});

test("respuesta, sesión e items: principal + alternativas, exploración, explicaciones del grounding", async () => {
  const { res, base } = await llamar({
    preferencias: PREF,
    vinos: [
      { id: v(1), nombre: "Favorito", bodega: "Bodega Uno", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [4.5, 5] },
      { id: v(2), nombre: "Bien puntuado", varietal: "Merlot", stock: 1, puntuaciones: [4] },
      { id: v(3), nombre: "Otro puntuado", varietal: "Syrah", stock: 1, puntuaciones: [4] },
      { id: v(4), nombre: "Para explorar", varietal: "Cabernet Franc", stock: 3 },
    ],
  }, { modo: "cellar", consulta: "  " });
  const c = res.cuerpo;
  assert.deepEqual(c.recomendaciones.map((r) => [r.posicion, r.wineId, r.rol, r.exploracion]),
    [[1, v(1), "principal", false], [2, v(2), "alternativa", false], [3, v(4), "alternativa", true]]);
  assert.equal(c.recomendaciones[0].explicacion, "Lo marcaste como favorito. Lo puntuaste con 4,75 estrellas en promedio, en 2 experiencias.");

  const s = base.tablas.recommendation_sessions[0];
  assert.deepEqual([s.user_id, s.mode, s.status, s.initial_input, s.engine_version, s.model],
    [base.tablas.profiles[0].id, "cellar", "active", null, "7.4-B1.1", null]);
  assert.deepEqual(s.context, { entrada: "elegir_de_mi_cava", tanda: 1, revision: 1, temporal: { restricciones: [] } });

  const items = base.tablas.recommendation_items;
  assert.equal(items.every((i) => i.session_id === s.id && i.batch_no === 1 && i.relationship === "owned"), true);
  for (const r of c.recomendaciones) {
    const i = items.find((x) => x.id === r.itemId);
    assert.equal(i.wine_id, r.wineId);
    assert.equal(explicar(i.grounding.afirmaciones), r.explicacion);
    assert.equal(i.signals.rol, r.rol);
    assert.equal(i.wine_identity.nombre, r.vino.nombre);
  }
});

test("no escribe user_knowledge ni recommendation_events: solo sesión e items", async () => {
  const { base } = await llamar({
    preferencias: PREF,
    vinos: [{ id: v(1), nombre: "A", varietal: "Cabernet Franc", stock: 1 }, { id: v(2), nombre: "B", stock: 1, favorito: true }],
    conocimiento: [{ id: "k1", knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", meaning: "x", source_type: "behavior", evidence: { a: 1 } }],
  });
  assert.deepEqual(tablasEscritas(base), ["recommendation_items", "recommendation_sessions"]);
  assert.deepEqual(base.escrituras.map((e) => e.op), ["insert", "insert"]);
  assert.equal(base.tablas.user_knowledge.length, 1);
  assert.equal(base.tablas.recommendation_events.length, 0);
});

test("«hoy no quiero Malbec»: 400 refinamiento_no_disponible, sin motor, sesión ni items (aunque haya un Malbec elegible)", async () => {
  const esc = {
    preferencias: PREF,
    vinos: [{ id: v(1), nombre: "Malbec favorito", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [5] }, { id: v(2), nombre: "Merlot", varietal: "Merlot", stock: 1 }],
  };
  for (const consulta of ["hoy no quiero Malbec", "  hoy no quiero Malbec  ", "x"]) {
    const { res, base, llamadas } = await llamar(esc, { modo: "cellar", consulta });
    assert.equal(res.codigo, 400, consulta);
    assert.equal(res.cuerpo.codigo, "refinamiento_no_disponible");
    assert.match(res.cuerpo.error, /todavía no/i);
    assert.equal(res.cuerpo.recomendaciones, undefined);
    assert.equal(llamadas.length, 0, "no se invoca el motor");
    assert.deepEqual(base.escrituras, [], "no se registran sesiones ni items");
    assert.equal(base.tablas.recommendation_sessions.length + base.tablas.recommendation_items.length, 0);
  }
});

test("null, en blanco o ausente = sin consulta: inicio directo, mismo resultado, initial_input null", async () => {
  const esc = { preferencias: PREF, vinos: [{ id: v(1), nombre: "A", stock: 1 }, { id: v(2), nombre: "B", stock: 1, puntuaciones: [5] }] };
  const resultados = [];
  for (const body of [{ modo: "cellar" }, { modo: "cellar", consulta: null }, { modo: "cellar", consulta: "" }, { modo: "cellar", consulta: "   \n\t " }]) {
    const { res, base, llamadas } = await llamar(esc, body);
    assert.equal(res.codigo, 200, JSON.stringify(body));
    assert.equal(llamadas[0].consulta, null);
    assert.equal(base.tablas.recommendation_sessions[0].initial_input, null);
    resultados.push(res.cuerpo.recomendaciones.map((r) => [r.wineId, r.explicacion]));
  }
  for (const r of resultados) assert.deepEqual(r, resultados[0]);
});

test("modos fuera de alcance y entradas inválidas: sin leer datos ni crear sesión", async () => {
  const esc = { preferencias: PREF, vinos: [{ id: v(1), nombre: "A", stock: 1 }] };
  for (const [body, codigo, cod] of [
    [{ modo: "food", consulta: "asado" }, 501, "modo_no_disponible"],
    [{ modo: "discovery" }, 501, "modo_no_disponible"],
    [{}, 400, "modo_invalido"],
    [{ consulta: "algo" }, 400, "modo_invalido"],
    [{ modo: "CELLAR" }, 400, "modo_invalido"],
    [{ modo: "cellar", consulta: 42 }, 400, "consulta_invalida"],
    [{ modo: "cellar", consulta: { texto: "hoy no quiero Malbec" } }, 400, "consulta_invalida"],
    [{ modo: "cellar", consulta: "hoy no quiero Malbec" }, 400, "refinamiento_no_disponible"],
    [{ modo: "cellar", consulta: "x".repeat(1001) }, 400, "refinamiento_no_disponible"],
  ]) {
    const { res, base, llamadas } = await llamar(esc, body);
    assert.equal(res.codigo, codigo, JSON.stringify(body).slice(0, 40));
    assert.equal(res.cuerpo.codigo, cod);
    assert.equal(llamadas.length, 0);
    assert.deepEqual(base.escrituras, []);
  }
});

test("viewer: 403 sin_cava aunque pida cellar", async () => {
  const { res, llamadas, base } = await llamar({ rol: "viewer", vinos: [{ id: v(1), nombre: "A", stock: 1 }] });
  assert.equal(res.codigo, 403);
  assert.equal(res.cuerpo.codigo, "sin_cava");
  assert.equal(llamadas.length, 0);
  assert.deepEqual(base.escrituras, []);
});

test("salida del motor que no respeta los elegibles, el modo o viene vacía → 502, nada guardado", async () => {
  const esc = { preferencias: PREF, vinos: [{ id: v(1), nombre: "Con stock", stock: 1 }, { id: v(2), nombre: "Sin stock", stock: 0 }] };
  for (const motor of [
    () => ({ modo: "cellar", recomendaciones: [{ wineId: v(2), relationship: "owned", explicacion: "sin stock" }] }),
    () => ({ modo: "food", recomendaciones: [{ wineId: v(1), relationship: "owned", explicacion: "modo cambiado" }] }),
    () => ({ modo: "cellar", recomendaciones: [] }),
  ]) {
    const base = crearBase(esc);
    const res = resFalsa();
    await crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor })({ method: "POST", headers: AUTH, body: { modo: "cellar" } }, res);
    assert.equal(res.codigo, 502);
    assert.equal(res.cuerpo.codigo, "motor_invalido");
    assert.deepEqual(base.escrituras, []);
  }
});

test("el precio no altera la respuesta del endpoint", async () => {
  const esc = (p) => ({
    preferencias: PREF,
    vinos: [
      { id: v(1), nombre: "A", varietal: "Merlot", stock: 1, precio: p[0], puntuaciones: [4] },
      { id: v(2), nombre: "B", varietal: "Cabernet Franc", stock: 1, precio: p[1] },
      { id: v(3), nombre: "C", stock: 1, precio: p[2] },
      { id: v(4), nombre: "D", stock: 1, precio: p[3], favorito: true },
    ],
  });
  const quitarIds = (c) => c.recomendaciones.map(({ itemId, ...r }) => r);
  const a = await llamar(esc([100, 200, 300, 400]));
  const b = await llamar(esc([99999, null, 1, 50000]));
  assert.deepEqual(quitarIds(a.res.cuerpo), quitarIds(b.res.cuerpo));
});

// 7.4-B2: refinamiento por variedad a través de POST /api/que-tomo, sobre el
// doble de Supabase en memoria. La versión real (PostgreSQL + PostgREST) está
// en que_tomo.integracion.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "../../api/que-tomo.js";
import { motorCellar, explicar } from "../../api/_que-tomo/motor_cellar.js";
import { MAX_INTENTOS_CONCURRENCIA } from "../../api/_que-tomo/refinamiento.js";
import { crearBase, resFalsa, ENTORNO, USUARIO } from "./supabase_en_memoria.mjs";

const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const OTRO = "00000000-0000-0000-0000-0000000000ff";
const PREF = {
  onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"],
  exploration_open: true, preferred_grapes: ["cabernet_franc"], knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z",
};
// Primera tanda: Malbec favorito como principal.
const CAVA = () => ({
  preferencias: PREF,
  vinos: [
    { id: v(1), nombre: "Malbec favorito", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [4.5] },
    { id: v(2), nombre: "Merlot puntuado", varietal: "Merlot", stock: 1, puntuaciones: [4] },
    { id: v(3), nombre: "Syrah", varietal: "Syrah", stock: 1, puntuaciones: [4] },
    { id: v(4), nombre: "Corte con Malbec", varietal: "Malbec - Syrah", stock: 1, puntuaciones: [5] },
    { id: v(5), nombre: "Sin varietal", stock: 1 },
    { id: v(6), nombre: "Cabernet Franc sin tomar", varietal: "Cabernet Franc", stock: 1 },
    { id: v(7), nombre: "Bonarda sin stock", varietal: "Bonarda", stock: 0, puntuaciones: [5] },
  ],
});
const excluir = (sesionId, valor) => ({ modo: "cellar", sesionId, restriccion: { alcance: { tipo: "grape", valor } } });

function entorno(escenario) {
  const base = crearBase(escenario);
  const llamadas = [];
  const motor = (entrada) => { llamadas.push(entrada); return motorCellar(entrada); };
  async function pedir(body, { motorAlt } = {}) {
    const res = resFalsa();
    await crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor: motorAlt ?? motor })(
      { method: "POST", headers: { authorization: "Bearer token-bueno" }, body }, res);
    return res;
  }
  const sesion = (id) => base.tablas.recommendation_sessions.find((s) => s.id === id);
  const items = (id, tanda) => base.tablas.recommendation_items.filter((i) => i.session_id === id && (tanda === undefined || i.batch_no === tanda));
  const ids = (res) => res.cuerpo.recomendaciones.map((r) => r.wineId);
  return { base, llamadas, pedir, sesion, items, ids };
}

test("recorrido: tanda 1 con Malbec → «hoy no quiero Malbec» lo excluye en la tanda 2 → una consulta nueva lo vuelve a ofrecer", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  assert.equal(t1.codigo, 200);
  assert.equal(t1.cuerpo.tanda, 1);
  assert.deepEqual(t1.cuerpo.filtros, []);
  assert.equal(e.ids(t1)[0], v(1), "la principal de la tanda 1 es el Malbec favorito");
  const sid = t1.cuerpo.sesionId;

  const t2 = await e.pedir(excluir(sid, "Malbec"));
  assert.equal(t2.codigo, 200, JSON.stringify(t2.cuerpo));
  assert.equal(t2.cuerpo.sesionId, sid);
  assert.equal(t2.cuerpo.tanda, 2);
  assert.deepEqual(t2.cuerpo.filtros, [{ tipo: "grape", clave: "malbec", etiqueta: "Malbec" }]);
  assert.equal(e.ids(t2).includes(v(1)), false, "Malbec excluido");
  assert.equal(e.ids(t2).includes(v(4)), false, "el corte con Malbec es coincidencia confirmada");
  assert.equal(e.llamadas[1].candidatos.some((c) => [v(1), v(4)].includes(c.wineId)), false, "el motor no los recibe");
  assert.deepEqual(e.ids(t1), [v(1), v(4), v(6)]);
  assert.deepEqual(e.ids(t2), [v(2), v(3), v(6)]);
  // Un vino ya mostrado puede volver si sigue elegible: el Cabernet Franc de
  // exploración aparece en las dos tandas.
  assert.equal(t2.cuerpo.recomendaciones[2].exploracion, true);
  // Misma regla de orden y explicaciones verificables.
  for (const r of t2.cuerpo.recomendaciones) {
    const it = e.items(sid, 2).find((i) => i.id === r.itemId);
    assert.equal(explicar(it.grounding.afirmaciones), r.explicacion);
  }
  assert.deepEqual(e.items(sid, 2).map((i) => i.position), [1, 2, 3]);
  assert.equal(e.items(sid, 1).length, 3, "la tanda 1 queda intacta");
  assert.deepEqual(e.sesion(sid).context, {
    entrada: "elegir_de_mi_cava", tanda: 2, revision: 2, temporal: { restricciones: [{ tipo: "grape", clave: "malbec" }] },
  });
  assert.equal(e.sesion(sid).status, "active");

  const nueva = await e.pedir({ modo: "cellar" });
  assert.notEqual(nueva.cuerpo.sesionId, sid);
  assert.equal(nueva.cuerpo.tanda, 1);
  assert.deepEqual(nueva.cuerpo.filtros, []);
  assert.equal(e.ids(nueva)[0], v(1), "sin filtros, el Malbec vuelve a ser elegible");
});

test("filtros acumulados y repetidos: tanda 3 excluye Malbec y Syrah; repetir Malbec no duplica el filtro", async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  await e.pedir(excluir(sid, "Malbec"));
  const t3 = await e.pedir(excluir(sid, "syrah"));
  assert.equal(t3.cuerpo.tanda, 3);
  assert.deepEqual(t3.cuerpo.filtros.map((f) => f.clave), ["malbec", "syrah"]);
  assert.equal(e.ids(t3).some((id) => [v(1), v(3), v(4)].includes(id)), false);
  const t4 = await e.pedir(excluir(sid, "MALBEC"));
  assert.equal(t4.cuerpo.tanda, 4);
  assert.deepEqual(t4.cuerpo.filtros.map((f) => f.clave), ["malbec", "syrah"]);
  assert.deepEqual(e.sesion(sid).context.temporal.restricciones.map((f) => f.clave), ["malbec", "syrah"]);
  assert.equal(e.sesion(sid).context.revision, 4);
});

test("coincidencias inciertas: se conservan (tratamiento de 7.3-B) y llegan marcadas al motor", async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  await e.pedir(excluir(sid, "Malbec"));
  const sinVarietal = e.llamadas[1].candidatos.find((c) => c.wineId === v(5));
  assert.ok(sinVarietal, "el vino sin varietal sigue siendo candidato");
  assert.deepEqual(sinVarietal.coincidenciasInciertas.map((x) => [x.origen, x.coincidencia, x.alcance.clave]), [["temporal", "no_evaluable", "malbec"]]);
});

test("cero candidatos por el filtro: sin_candidatos excluidos_por_filtro, sesión activa con el filtro guardado; distinto de sin_stock", async () => {
  const e = entorno({
    preferencias: PREF,
    vinos: [
      { id: v(1), nombre: "Único Malbec", varietal: "Malbec", stock: 2 },
      { id: v(2), nombre: "Merlot sin stock", varietal: "Merlot", stock: 0 },
    ],
  });
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const r = await e.pedir(excluir(sid, "Malbec"));
  assert.equal(r.codigo, 200);
  assert.deepEqual([r.cuerpo.estado, r.cuerpo.motivo, r.cuerpo.sesionId, r.cuerpo.tanda], ["sin_candidatos", "excluidos_por_filtro", sid, null]);
  assert.deepEqual(r.cuerpo.filtros.map((f) => f.clave), ["malbec"]);
  assert.equal(r.cuerpo.biblioteca.excluidosPorFiltro, 1);
  assert.equal(e.llamadas.length, 1, "no se invoca el motor");
  assert.equal(e.items(sid).length, 1, "no hay tanda nueva");
  assert.deepEqual(e.sesion(sid).context, {
    entrada: "elegir_de_mi_cava", tanda: 1, revision: 2, temporal: { restricciones: [{ tipo: "grape", clave: "malbec" }] },
  });
  assert.equal(e.sesion(sid).status, "active");

  // La cava se queda sin stock: el motivo es la cava, no el filtro.
  e.base.tablas.wine_privado.find((p) => p.wine_id === v(1)).stock = 0;
  const s = await e.pedir(excluir(sid, "Syrah"));
  assert.deepEqual([s.cuerpo.estado, s.cuerpo.motivo], ["sin_candidatos", "sin_stock"]);
  assert.deepEqual(s.cuerpo.filtros.map((f) => f.clave), ["malbec", "syrah"]);
});

test("cero candidatos con restricción persistente + filtro: el motivo es el filtro solo si algún vino lo excluye únicamente el filtro", async () => {
  const e = entorno({
    preferencias: PREF,
    vinos: [{ id: v(1), nombre: "Malbec", varietal: "Malbec", stock: 1 }, { id: v(2), nombre: "Syrah", varietal: "Syrah", stock: 1 }],
    conocimiento: [{ id: "k1", knowledge_type: "restriction", scope_type: "grape", scope_value: "syrah", meaning: "no me recomiendes Syrah" }],
  });
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const r = await e.pedir(excluir(sid, "Malbec"));
  assert.equal(r.cuerpo.motivo, "excluidos_por_filtro");
  assert.deepEqual([r.cuerpo.biblioteca.excluidosPorRestriccion, r.cuerpo.biblioteca.excluidosPorFiltro], [1, 1]);
});

test("stock vigente: lo que se agotó desaparece y lo que se repuso aparece en la tanda siguiente", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  assert.equal(e.ids(t1).includes(v(7)), false);
  e.base.tablas.wine_privado.find((p) => p.wine_id === v(2)).stock = 0; // Merlot agotado
  e.base.tablas.wine_privado.find((p) => p.wine_id === v(7)).stock = 3; // Bonarda repuesta (5 estrellas)
  const t2 = await e.pedir(excluir(sid, "Malbec"));
  assert.equal(e.ids(t2).includes(v(2)), false);
  assert.equal(e.ids(t2)[0], v(7));
  assert.equal(t2.cuerpo.recomendaciones[0].stock, 3);
});

test("sesión ajena, inexistente, inactiva o de otro modo: rechazo sin leer contexto ni escribir", async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const ajena = "aaaaaaaa-0000-4000-8000-000000000001";
  const cerrada = "aaaaaaaa-0000-4000-8000-000000000002";
  const food = "aaaaaaaa-0000-4000-8000-000000000003";
  const ctx = { entrada: "elegir_de_mi_cava", tanda: 1, revision: 1, temporal: { restricciones: [] } };
  e.base.tablas.recommendation_sessions.push(
    { id: ajena, user_id: OTRO, mode: "cellar", status: "active", context: structuredClone(ctx) },
    { id: cerrada, user_id: USUARIO, mode: "cellar", status: "completed", context: structuredClone(ctx) },
    { id: food, user_id: USUARIO, mode: "food", status: "active", context: structuredClone(ctx) },
  );
  const escriturasAntes = e.base.escrituras.length;
  const llamadasAntes = e.llamadas.length;
  for (const [id, codigo, cod] of [
    [ajena, 404, "sesion_no_encontrada"],
    ["aaaaaaaa-0000-4000-8000-00000000ffff", 404, "sesion_no_encontrada"],
    [cerrada, 409, "sesion_inactiva"],
    [food, 409, "sesion_incompatible"],
  ]) {
    const r = await e.pedir(excluir(id, "Malbec"));
    assert.equal(r.codigo, codigo, id);
    assert.equal(r.cuerpo.codigo, cod);
  }
  assert.equal(e.base.escrituras.length, escriturasAntes);
  assert.equal(e.llamadas.length, llamadasAntes);
  assert.deepEqual(e.base.tablas.recommendation_sessions.find((s) => s.id === ajena).context, ctx, "la sesión ajena no cambia");
  assert.equal(e.sesion(sid).context.revision, 1);
});

test("entrada inválida: 400 antes de leer datos, sin motor ni escrituras", async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const antes = e.base.escrituras.length;
  for (const [body, cod] of [
    [{ modo: "cellar", restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, "sesion_requerida"],
    [{ modo: "cellar", sesionId: "no-es-uuid", restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, "sesion_invalida"],
    [{ modo: "cellar", sesionId: sid }, "restriccion_invalida"],
    [{ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "winery", valor: "Bodega" } } }, "restriccion_invalida"],
    [{ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "grape", valor: "Cabernet" } } }, "restriccion_invalida"],
    [{ ...excluir(sid, "Malbec"), consulta: "hoy no quiero Malbec" }, "refinamiento_no_disponible"],
    [{ ...excluir(sid, "Malbec"), modo: "food" }, "modo_no_disponible"],
  ]) {
    const r = await e.pedir(body);
    assert.equal(r.cuerpo.codigo, cod, JSON.stringify(body).slice(0, 60));
    assert.ok([400, 501].includes(r.codigo));
  }
  assert.equal(e.base.escrituras.length, antes);
  assert.equal(e.llamadas.length, 1);
  assert.equal(e.sesion(sid).context.revision, 1);
});

test("solicitudes simultáneas: ninguna pierde su filtro y las tandas no se duplican", async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  e.base.barrera(2); // las dos escrituras esperan a que ambos pedidos hayan leído la revisión 1
  const [a, b] = await Promise.all([e.pedir(excluir(sid, "Malbec")), e.pedir(excluir(sid, "Syrah"))]);
  assert.equal(a.codigo, 200, JSON.stringify(a.cuerpo));
  assert.equal(b.codigo, 200, JSON.stringify(b.cuerpo));
  assert.deepEqual([a.cuerpo.tanda, b.cuerpo.tanda].sort(), [2, 3]);
  const ctx = e.sesion(sid).context;
  assert.deepEqual(ctx.temporal.restricciones.map((f) => f.clave).sort(), ["malbec", "syrah"]);
  assert.deepEqual([ctx.tanda, ctx.revision], [3, 3]);
  // El pedido que reintentó ya aplicó los dos filtros.
  const ultimo = a.cuerpo.tanda === 3 ? a : b;
  assert.deepEqual(ultimo.cuerpo.filtros.map((f) => f.clave).sort(), ["malbec", "syrah"]);
  assert.equal(e.ids(ultimo).some((id) => [v(1), v(3), v(4)].includes(id)), false);
  // Sin ranuras duplicadas (session_id, batch_no, position).
  const ranuras = e.items(sid).map((i) => `${i.batch_no}:${i.position}`);
  assert.equal(new Set(ranuras).size, ranuras.length);
  assert.deepEqual([...new Set(e.items(sid).map((i) => i.batch_no))].sort(), [1, 2, 3]);
  assert.ok(e.llamadas.length >= 4, "el pedido que perdió volvió a calcular su tanda");
});

test(`conflicto persistente: tras ${MAX_INTENTOS_CONCURRENCIA} intentos responde 409 sin tanda nueva`, async () => {
  const e = entorno(CAVA());
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  // Otro escritor cambia la revisión cada vez que el motor corre.
  const motorAlt = (entrada) => {
    e.sesion(sid).context = { ...e.sesion(sid).context, revision: e.sesion(sid).context.revision + 1 };
    return motorCellar(entrada);
  };
  const r = await e.pedir(excluir(sid, "Malbec"), { motorAlt });
  assert.equal(r.codigo, 409);
  assert.equal(r.cuerpo.codigo, "conflicto_concurrente");
  assert.equal(e.items(sid, 2).length, 0);
  assert.equal(e.sesion(sid).context.tanda, 1);
});

test("el refinamiento solo escribe recommendation_sessions (UPDATE) y recommendation_items (INSERT)", async () => {
  const e = entorno({
    ...CAVA(),
    conocimiento: [{ id: "k1", knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", meaning: "x", source_type: "behavior", evidence: { a: 1 } }],
  });
  const sid = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const desde = e.base.escrituras.length;
  await e.pedir(excluir(sid, "Malbec"));
  await e.pedir(excluir(sid, "Syrah"));
  const nuevas = e.base.escrituras.slice(desde).map((w) => `${w.tabla}:${w.op}`);
  assert.deepEqual(nuevas, [
    "recommendation_sessions:update", "recommendation_items:insert",
    "recommendation_sessions:update", "recommendation_items:insert",
  ]);
  assert.equal(e.base.tablas.user_knowledge.length, 1);
  assert.equal(e.base.tablas.recommendation_events.length, 0);
});

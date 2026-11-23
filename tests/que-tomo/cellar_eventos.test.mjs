// 7.4-B4: medición de beta (acción «evento») sobre el doble en memoria.
// La versión real (PostgreSQL + PostgREST) está en que_tomo.integracion.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { crearHandler } from "../../api/que-tomo.js";
import { motorCellar } from "../../api/_que-tomo/motor_cellar.js";
import { validarEvento, idEvento } from "../../api/_que-tomo/eventos.js";
import { crearBase, resFalsa, ENTORNO, USUARIO } from "./supabase_en_memoria.mjs";

const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const OTRO = "00000000-0000-0000-0000-0000000000ff";
const CAVA = () => ({
  preferencias: { onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"], exploration_open: true, preferred_grapes: ["cabernet_franc"], knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z" },
  vinos: [
    { id: v(1), nombre: "Malbec favorito", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [4.5] },
    { id: v(2), nombre: "Merlot", varietal: "Merlot", stock: 1, puntuaciones: [4] },
    { id: v(3), nombre: "Syrah", varietal: "Syrah", stock: 1 },
  ],
});
const ev = (sesionId, tipo, extra = {}) => ({ accion: "evento", sesionId, tipo, ...extra });

function entorno(escenario = CAVA()) {
  const base = crearBase(escenario);
  async function pedir(body) {
    const res = resFalsa();
    await crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor: motorCellar })(
      { method: "POST", headers: { authorization: "Bearer token-bueno" }, body }, res);
    return res;
  }
  const eventos = (tipo) => base.tablas.recommendation_events.filter((e) => !tipo || e.event_type === tipo);
  // Simula registrar_consumo del flujo de apertura existente.
  const abrir = (wineId, user = USUARIO) => {
    const id = crypto.randomUUID();
    base.tablas.consumos.push({ id, wine_id: wineId, user_id: user, fecha: new Date().toISOString(), puntuacion: null });
    return id;
  };
  return { base, pedir, eventos, abrir };
}

test("validación de entrada por tipo", () => {
  const S = "5b37f15f-a34b-4dce-a59b-397066b7f23d";
  const I = "6b37f15f-a34b-4dce-a59b-397066b7f23d";
  assert.equal(validarEvento({ sesionId: S, tipo: "shown", itemIds: [I] }).ok, true);
  for (const [body, codigo] of [
    [{ sesionId: "x", tipo: "shown", itemIds: [I] }, "sesion_invalida"],
    [{ sesionId: S, tipo: "dismissed" }, "evento_invalido"],
    [{ sesionId: S, tipo: "shown", itemIds: [] }, "item_invalido"],
    [{ sesionId: S, tipo: "shown", itemIds: [I, I] }, "item_invalido"],
    [{ sesionId: S, tipo: "shown", itemIds: [I, I, I, I] }, "item_invalido"],
    [{ sesionId: S, tipo: "selected" }, "item_invalido"],
    [{ sesionId: S, tipo: "bottle_opened", itemId: I }, "consumo_invalido"],
    [{ sesionId: S, tipo: "new_batch", origen: "otro", resultado: "ok", tanda: 2 }, "evento_invalido"],
    [{ sesionId: S, tipo: "new_batch", origen: "refinamiento", resultado: "ok", tanda: 1 }, "evento_invalido"],
    [{ sesionId: S, tipo: "new_batch", origen: "refinamiento", resultado: "sin_candidatos", motivo: "biblioteca_vacia" }, "evento_invalido"],
    [{ sesionId: S, tipo: "new_batch", origen: "refinamiento", resultado: "ok", tanda: 2, filtros: ["Malbec!"] }, "evento_invalido"],
  ]) {
    const r = validarEvento(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.codigo, codigo, JSON.stringify(body));
  }
});

test("recorrido: shown → selected → bottle_opened, con el consumo del flujo de apertura", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const ids = t1.cuerpo.recomendaciones.map((r) => r.itemId);
  const s = await e.pedir(ev(sid, "shown", { itemIds: ids }));
  assert.deepEqual([s.codigo, s.cuerpo.registrados, s.cuerpo.duplicados], [200, ids.length, 0]);
  assert.deepEqual(e.eventos("shown").map((x) => [x.recommendation_item_id, x.payload.tanda, x.payload.posicion]), ids.map((id, i) => [id, 1, i + 1]));

  const principal = t1.cuerpo.recomendaciones[0];
  const sel = await e.pedir(ev(sid, "selected", { itemId: principal.itemId }));
  assert.equal(sel.cuerpo.registrados, 1);
  const consumoId = e.abrir(principal.wineId);
  const ab = await e.pedir(ev(sid, "bottle_opened", { itemId: principal.itemId, consumoId }));
  assert.equal(ab.codigo, 200, JSON.stringify(ab.cuerpo));
  assert.deepEqual(e.eventos("bottle_opened")[0].payload, { tanda: 1, consumoId });
  assert.equal(e.eventos().every((x) => x.session_id === sid), true);
});

test("elección cancelada: selected sin bottle_opened", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  await e.pedir(ev(t1.cuerpo.sesionId, "selected", { itemId: t1.cuerpo.recomendaciones[0].itemId }));
  assert.equal(e.eventos("selected").length, 1);
  assert.equal(e.eventos("bottle_opened").length, 0);
});

test("sin duplicados: renderizados repetidos, reintentos y dobles toques (también simultáneos) caen sobre el mismo id", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const ids = t1.cuerpo.recomendaciones.map((r) => r.itemId);
  await e.pedir(ev(sid, "shown", { itemIds: ids }));
  const otra = await e.pedir(ev(sid, "shown", { itemIds: ids }));
  assert.deepEqual([otra.codigo, otra.cuerpo.registrados, otra.cuerpo.duplicados], [200, 0, ids.length]);
  await Promise.all([1, 2, 3].map(() => e.pedir(ev(sid, "selected", { itemId: ids[0] }))));
  assert.equal(e.eventos("shown").length, ids.length);
  assert.equal(e.eventos("selected").length, 1);
  assert.equal(e.eventos("selected")[0].id, idEvento([sid, ids[0], "selected"]));
  // Dos botellas del mismo vino recomendado: dos aperturas distintas.
  const c1 = e.abrir(t1.cuerpo.recomendaciones[0].wineId);
  const c2 = e.abrir(t1.cuerpo.recomendaciones[0].wineId);
  for (const c of [c1, c1, c2]) await e.pedir(ev(sid, "bottle_opened", { itemId: ids[0], consumoId: c }));
  assert.equal(e.eventos("bottle_opened").length, 2);
  assert.equal(e.base.escrituras.filter((w) => w.tabla === "recommendation_events" && w.op !== "upsert").length, 0, "nunca UPDATE");
});

test("new_batch: refinamiento y reserva, con resultado ok o sin candidatos; filtros verificados contra la sesión", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const t2 = await e.pedir({ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } });
  const r = await e.pedir(ev(sid, "new_batch", { origen: "refinamiento", tanda: t2.cuerpo.tanda, resultado: "ok", filtros: ["malbec"] }));
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(e.eventos("new_batch")[0].payload, { origen: "refinamiento", tanda: 2, resultado: "ok", motivo: null, filtros: ["malbec"] });
  // Filtro que no está en la sesión → 400; tanda inexistente → 404.
  assert.equal((await e.pedir(ev(sid, "new_batch", { origen: "refinamiento", tanda: 2, resultado: "ok", filtros: ["syrah"] }))).cuerpo.codigo, "evento_invalido");
  assert.equal((await e.pedir(ev(sid, "new_batch", { origen: "refinamiento", tanda: 9, resultado: "ok", filtros: ["malbec"] }))).cuerpo.codigo, "tanda_no_encontrada");
  // Sin candidatos dentro de la sesión (consulta sin stock con sesión).
  for (const p of e.base.tablas.wine_privado) p.stock = 0;
  const t3 = await e.pedir({ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "grape", valor: "Syrah" } } });
  assert.deepEqual([t3.cuerpo.estado, t3.cuerpo.motivo], ["sin_candidatos", "sin_stock"]);
  for (let i = 0; i < 2; i++) {
    await e.pedir(ev(sid, "new_batch", { origen: "refinamiento", tanda: null, resultado: "sin_candidatos", motivo: "sin_stock", filtros: ["syrah", "malbec"] }));
  }
  const sinStock = e.eventos("new_batch").filter((x) => x.payload.resultado === "sin_candidatos");
  assert.deepEqual(sinStock.map((x) => [x.payload.motivo, x.payload.filtros]), [["sin_stock", ["malbec", "syrah"]]]);
});

test("pertenencia: sesión ajena o inexistente, ítem de otra sesión, consumo ajeno o de otro vino → 404 sin escribir", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const t2 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const item = t1.cuerpo.recomendaciones[0];
  const ajena = "aaaaaaaa-0000-4000-8000-000000000001";
  e.base.tablas.recommendation_sessions.push({ id: ajena, user_id: OTRO, mode: "cellar", status: "active", context: {} });
  const itemAjeno = "bbbbbbbb-0000-4000-8000-000000000001";
  e.base.tablas.recommendation_items.push({ id: itemAjeno, session_id: ajena, batch_no: 1, position: 1, wine_id: v(1) });
  const consumoAjeno = e.abrir(item.wineId, OTRO);
  const consumoOtroVino = e.abrir(t1.cuerpo.recomendaciones[1].wineId);
  const antes = e.eventos().length;
  for (const [body, codigo, cod] of [
    [ev(ajena, "shown", { itemIds: [itemAjeno] }), 404, "sesion_no_encontrada"],
    [ev("aaaaaaaa-0000-4000-8000-00000000ffff", "selected", { itemId: item.itemId }), 404, "sesion_no_encontrada"],
    [ev(sid, "selected", { itemId: t2.cuerpo.recomendaciones[0].itemId }), 404, "item_no_encontrado"],
    [ev(sid, "shown", { itemIds: [item.itemId, itemAjeno] }), 404, "item_no_encontrado"],
    [ev(sid, "bottle_opened", { itemId: item.itemId, consumoId: consumoAjeno }), 404, "consumo_no_encontrado"],
    [ev(sid, "bottle_opened", { itemId: item.itemId, consumoId: consumoOtroVino }), 404, "consumo_no_encontrado"],
  ]) {
    const r = await e.pedir(body);
    assert.equal(r.codigo, codigo, cod);
    assert.equal(r.cuerpo.codigo, cod);
  }
  assert.equal(e.eventos().length, antes);
});

test("shown no mezcla tandas; sesión cerrada sigue aceptando la medición de una apertura", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const t2 = await e.pedir({ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } });
  const mezcla = await e.pedir(ev(sid, "shown", { itemIds: [t1.cuerpo.recomendaciones[0].itemId, t2.cuerpo.recomendaciones[0].itemId] }));
  assert.deepEqual([mezcla.codigo, mezcla.cuerpo.codigo], [400, "item_invalido"]);
  e.base.tablas.recommendation_sessions.find((x) => x.id === sid).status = "completed";
  const it = t2.cuerpo.recomendaciones[0];
  const r = await e.pedir(ev(sid, "bottle_opened", { itemId: it.itemId, consumoId: e.abrir(it.wineId) }));
  assert.equal(r.codigo, 200);
});

test("una falla al registrar el evento responde 503 sin tocar la sesión ni las recomendaciones", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  e.base.fallar("recommendation_events:upsert");
  const r = await e.pedir(ev(sid, "shown", { itemIds: [t1.cuerpo.recomendaciones[0].itemId] }));
  assert.deepEqual([r.codigo, r.cuerpo.codigo], [503, "evento_no_registrado"]);
  const t2 = await e.pedir({ modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } });
  assert.equal(t2.codigo, 200, "la recomendación sigue funcionando");
  assert.equal(e.eventos().length, 0);
});

test("solo se escribe recommendation_events: ni sesiones, ni ítems, ni conocimiento", async () => {
  const e = entorno();
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const desde = e.base.escrituras.length;
  const revision = e.base.tablas.recommendation_sessions[0].context.revision;
  await e.pedir(ev(sid, "shown", { itemIds: t1.cuerpo.recomendaciones.map((r) => r.itemId) }));
  await e.pedir(ev(sid, "selected", { itemId: t1.cuerpo.recomendaciones[0].itemId }));
  assert.deepEqual([...new Set(e.base.escrituras.slice(desde).map((w) => w.tabla))], ["recommendation_events"]);
  assert.equal(e.base.tablas.recommendation_sessions[0].context.revision, revision);
  assert.equal(e.base.tablas.user_knowledge.length, 0);
});

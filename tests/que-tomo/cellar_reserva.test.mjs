// 7.4-B3: «Guardar para una ocasión especial» a través de POST /api/que-tomo,
// sobre el doble de Supabase en memoria. La versión real (PostgreSQL +
// PostgREST) está en que_tomo.integracion.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler } from "../../api/que-tomo.js";
import { motorCellar } from "../../api/_que-tomo/motor_cellar.js";
import { idReserva, MARCA_RESERVA } from "../../api/_que-tomo/conocimiento/reserva.js";
import { crearBase, resFalsa, ENTORNO, USUARIO } from "./supabase_en_memoria.mjs";

const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const OTRO = "00000000-0000-0000-0000-0000000000ff";
const PREF = {
  onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"],
  exploration_open: true, preferred_grapes: ["cabernet_franc"], knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z",
};
const CAVA = () => ({
  preferencias: PREF,
  vinos: [
    { id: v(1), nombre: "Malbec favorito", varietal: "Malbec", stock: 2, favorito: true, puntuaciones: [4.5] },
    { id: v(2), nombre: "Merlot puntuado", varietal: "Merlot", stock: 1, puntuaciones: [4] },
    { id: v(3), nombre: "Syrah", varietal: "Syrah", stock: 1, puntuaciones: [4] },
    { id: v(4), nombre: "Cabernet Franc sin tomar", varietal: "Cabernet Franc", stock: 1 },
    { id: v(5), nombre: "Bonarda", varietal: "Bonarda", stock: 1 },
  ],
});
const reservar = (sesionId, itemId) => ({ accion: "reservar", modo: "cellar", sesionId, itemId });
const quitar = (wineId) => ({ accion: "quitar_reserva", wineId });
const excluir = (sesionId, valor) => ({ modo: "cellar", sesionId, restriccion: { alcance: { tipo: "grape", valor } } });

function entorno(escenario) {
  const base = crearBase(escenario);
  async function pedir(body) {
    const res = resFalsa();
    await crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor: motorCellar })(
      { method: "POST", headers: { authorization: "Bearer token-bueno" }, body }, res);
    return res;
  }
  const ids = (res) => res.cuerpo.recomendaciones.map((r) => r.wineId);
  const itemDe = (res, wineId) => res.cuerpo.recomendaciones.find((r) => r.wineId === wineId).itemId;
  const reservas = (wineId) => base.tablas.user_knowledge.filter((k) => k.wine_id === wineId && k.value?.marca === "reserva");
  const sesion = (id) => base.tablas.recommendation_sessions.find((s) => s.id === id);
  const tandas = (id) => [...new Set(base.tablas.recommendation_items.filter((i) => i.session_id === id).map((i) => i.batch_no))].sort();
  return { base, pedir, ids, itemDe, reservas, sesion, tandas };
}

test("recorrido: reservar el vino recomendado → sale de la tanda y de una consulta nueva → quitar la reserva → vuelve", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  assert.equal(e.ids(t1)[0], v(1));
  const sid = t1.cuerpo.sesionId;

  const r = await e.pedir(reservar(sid, e.itemDe(t1, v(1))));
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.estado, r.cuerpo.sesionId, r.cuerpo.tanda], ["ok", sid, 2]);
  assert.deepEqual(r.cuerpo.reserva, { id: idReserva(USUARIO, v(1)), wineId: v(1), estado: "guardada" });
  assert.equal(e.ids(r).includes(v(1)), false, "sale de la tanda actual");
  assert.deepEqual(r.cuerpo.filtros, [], "la reserva no es un filtro temporal");
  assert.deepEqual(e.sesion(sid).context.temporal, { restricciones: [] });

  const [fila] = e.reservas(v(1));
  assert.deepEqual(
    [fila.id, fila.user_id, fila.knowledge_type, fila.scope_type, fila.scope_value, fila.wine_id, fila.source_type, fila.status, fila.strength],
    [idReserva(USUARIO, v(1)), USUARIO, "explicit", "wine", null, v(1), "recommender", "active", null]);
  assert.deepEqual(fila.value, MARCA_RESERVA);
  assert.equal(fila.wine_snapshot.nombre, "Malbec favorito");
  assert.deepEqual(fila.evidence, { origen: "elegir_de_mi_cava", sesionId: sid, itemId: e.itemDe(t1, v(1)), tanda: 1 });
  assert.equal(e.base.tablas.wine_privado.find((p) => p.wine_id === v(1)).stock, 2, "el stock no cambia");

  const nueva = await e.pedir({ modo: "cellar" });
  assert.equal(e.ids(nueva).includes(v(1)), false, "excluido de una consulta nueva");

  const q = await e.pedir(quitar(v(1)));
  assert.equal(q.codigo, 200);
  assert.deepEqual(q.cuerpo, { estado: "ok", reserva: { wineId: v(1), estado: "quitada" } });
  assert.equal(e.reservas(v(1))[0].status, "revoked");

  const otra = await e.pedir({ modo: "cellar" });
  assert.equal(e.ids(otra)[0], v(1), "vuelve a ser elegible");

  // Reservar de nuevo reactiva la misma fila; nunca hay dos.
  const r2 = await e.pedir(reservar(otra.cuerpo.sesionId, e.itemDe(otra, v(1))));
  assert.equal(r2.cuerpo.reserva.estado, "reactivada");
  assert.equal(e.reservas(v(1)).length, 1);
  assert.equal(e.reservas(v(1))[0].status, "active");
});

test("quitar la reserva: sin sesión, idempotente y solo esa reserva de ese vino", async () => {
  const e = entorno({
    ...CAVA(),
    conocimiento: [{ id: "k-ocasion", knowledge_type: "explicit", scope_type: "wine", wine_id: v(1), wine_snapshot: { nombre: "Malbec favorito" }, meaning: "lo abrimos en aniversarios", value: null, source_type: "conversation" }],
  });
  const t1 = await e.pedir({ modo: "cellar" });
  await e.pedir(reservar(t1.cuerpo.sesionId, e.itemDe(t1, v(1))));
  const t2 = (await e.pedir({ modo: "cellar" }));
  await e.pedir(reservar(t2.cuerpo.sesionId, t2.cuerpo.recomendaciones[0].itemId)); // reserva otro vino
  const otroReservado = t2.cuerpo.recomendaciones[0].wineId;
  // La sesión puede estar cerrada: quitar no la necesita.
  e.sesion(t1.cuerpo.sesionId).status = "completed";

  const q = await e.pedir(quitar(v(1).toUpperCase()));
  assert.equal(q.cuerpo.reserva.estado, "quitada");
  assert.equal(e.reservas(v(1))[0].status, "revoked");
  assert.equal(e.reservas(otroReservado)[0].status, "active", "la otra reserva sigue");
  assert.equal(e.base.tablas.user_knowledge.find((k) => k.id === "k-ocasion").status, "active", "otro conocimiento del mismo vino no se toca");
  const q2 = await e.pedir(quitar(v(1)));
  assert.deepEqual(q2.cuerpo.reserva, { wineId: v(1), estado: "no_habia_reserva" });
});

test("último vino disponible: sin_candidatos excluidos_por_reserva, sesión activa; si no hay stock, sin_stock", async () => {
  const e = entorno({ preferencias: PREF, vinos: [{ id: v(1), nombre: "Único", varietal: "Malbec", stock: 1 }, { id: v(2), nombre: "Agotado", stock: 0 }] });
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const r = await e.pedir(reservar(sid, e.itemDe(t1, v(1))));
  assert.equal(r.codigo, 200);
  assert.deepEqual([r.cuerpo.estado, r.cuerpo.motivo, r.cuerpo.tanda, r.cuerpo.sesionId], ["sin_candidatos", "excluidos_por_reserva", null, sid]);
  assert.equal(r.cuerpo.biblioteca.excluidosPorReserva, 1);
  assert.equal(r.cuerpo.reserva.estado, "guardada");
  assert.equal(e.sesion(sid).status, "active");
  assert.equal(e.sesion(sid).context.revision, 1, "sin filtro nuevo, la sesión no se reescribe");

  // Otra cava: el vino reservado se quedó sin stock antes de reservarlo.
  const f = entorno({ preferencias: PREF, vinos: [{ id: v(1), nombre: "Único", stock: 1 }] });
  const s1 = await f.pedir({ modo: "cellar" });
  f.base.tablas.wine_privado[0].stock = 0;
  const s2 = await f.pedir(reservar(s1.cuerpo.sesionId, f.itemDe(s1, v(1))));
  assert.deepEqual([s2.cuerpo.estado, s2.cuerpo.motivo], ["sin_candidatos", "sin_stock"]);
  assert.equal(f.reservas(v(1)).length, 1, "la reserva se guarda igual");
});

test("con filtros temporales previos: la tanda los conserva, y la reserva no queda como filtro", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const t2 = await e.pedir(excluir(sid, "Malbec"));
  const reservado = t2.cuerpo.recomendaciones[0].wineId;
  const t3 = await e.pedir(reservar(sid, t2.cuerpo.recomendaciones[0].itemId));
  assert.equal(t3.cuerpo.tanda, 3);
  assert.deepEqual(t3.cuerpo.filtros.map((f) => f.clave), ["malbec"]);
  assert.equal(e.ids(t3).some((id) => [v(1), reservado].includes(id)), false);
  assert.deepEqual(e.sesion(sid).context.temporal.restricciones, [{ tipo: "grape", clave: "malbec" }]);

  await e.pedir(quitar(reservado));
  const t4 = await e.pedir(excluir(sid, "Bonarda"));
  assert.equal(e.ids(t4).includes(reservado), true, "al quitar la reserva vuelve en la misma sesión");
  assert.equal(e.ids(t4).includes(v(1)), false, "el filtro Malbec sigue");
});

test("doble toque y pedidos simultáneos: una sola reserva; las tandas no se repiten", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const item = e.itemDe(t1, v(1));
  e.base.barrera(2);
  const [a, b] = await Promise.all([e.pedir(reservar(sid, item)), e.pedir(reservar(sid, item))]);
  assert.equal(a.codigo, 200, JSON.stringify(a.cuerpo));
  assert.equal(b.codigo, 200, JSON.stringify(b.cuerpo));
  assert.deepEqual([a.cuerpo.tanda, b.cuerpo.tanda].sort(), [2, 3]);
  assert.equal(e.reservas(v(1)).length, 1);
  assert.equal(e.reservas(v(1)).filter((k) => k.status === "active").length, 1);
  assert.deepEqual(e.tandas(sid), [1, 2, 3]);

  const escriturasAntes = e.base.escrituras.filter((w) => w.tabla === "user_knowledge").length;
  const c = await e.pedir(reservar(sid, item));
  assert.equal(c.cuerpo.reserva.estado, "ya_estaba_activa");
  assert.equal(e.base.escrituras.filter((w) => w.tabla === "user_knowledge").length, escriturasAntes, "no reescribe");
  assert.equal(e.reservas(v(1)).length, 1);
});

test("falla al registrar la tanda: reserva guardada y reintentable; el reintento no la duplica", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  e.base.fallar("recommendation_items:insert");
  const r = await e.pedir(reservar(sid, e.itemDe(t1, v(1))));
  assert.equal(r.codigo, 503);
  assert.deepEqual([r.cuerpo.estado, r.cuerpo.codigo, r.cuerpo.reintentable, r.cuerpo.sesionId], ["reserva_guardada_sin_tanda", "persistencia_error", true, sid]);
  assert.deepEqual(r.cuerpo.reserva, { id: idReserva(USUARIO, v(1)), wineId: v(1), estado: "guardada" });
  assert.equal(r.cuerpo.recomendaciones, undefined);
  assert.equal(e.reservas(v(1)).length, 1);

  e.base.reparar("recommendation_items:insert");
  const re = await e.pedir(reservar(sid, e.itemDe(t1, v(1))));
  assert.equal(re.codigo, 200);
  assert.equal(re.cuerpo.reserva.estado, "ya_estaba_activa");
  assert.equal(re.cuerpo.tanda, 3, "la tanda 2 quedó reservada sin ítems");
  assert.equal(e.ids(re).includes(v(1)), false);
  assert.equal(e.reservas(v(1)).length, 1);
});

test("falla al guardar la reserva: 503 reserva_no_guardada, sin tanda ni cambios en la sesión", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  e.base.fallar("user_knowledge:upsert");
  const r = await e.pedir(reservar(sid, e.itemDe(t1, v(1))));
  assert.deepEqual([r.codigo, r.cuerpo.codigo], [503, "reserva_no_guardada"]);
  assert.equal(e.reservas(v(1)).length, 0);
  assert.deepEqual(e.tandas(sid), [1]);
  assert.equal(e.sesion(sid).context.revision, 1);
});

test("rechazos: sesión ajena o inactiva, ítem de otra sesión o ajeno, vino ajeno, entradas inválidas — sin escrituras", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  const sid = t1.cuerpo.sesionId;
  const otraPropia = (await e.pedir({ modo: "cellar" })).cuerpo.sesionId;
  const itemPropio = e.itemDe(t1, v(1));
  const ajena = "aaaaaaaa-0000-4000-8000-000000000001";
  const cerrada = "aaaaaaaa-0000-4000-8000-000000000002";
  const itemAjeno = "bbbbbbbb-0000-4000-8000-000000000001";
  const vinoAjeno = "cccccccc-0000-4000-8000-000000000001";
  const ctx = { entrada: "elegir_de_mi_cava", tanda: 1, revision: 1, temporal: { restricciones: [] } };
  e.base.tablas.recommendation_sessions.push(
    { id: ajena, user_id: OTRO, mode: "cellar", status: "active", context: structuredClone(ctx) },
    { id: cerrada, user_id: USUARIO, mode: "cellar", status: "completed", context: structuredClone(ctx) },
  );
  e.base.tablas.wines.push({ id: vinoAjeno, nombre: "Ajeno", user_id: OTRO });
  e.base.tablas.recommendation_items.push({ id: itemAjeno, session_id: ajena, batch_no: 1, position: 1, wine_id: vinoAjeno, relationship: "owned" });
  const antes = e.base.escrituras.length;
  for (const [body, codigo, cod] of [
    [reservar(ajena, itemAjeno), 404, "sesion_no_encontrada"],
    [reservar(cerrada, itemPropio), 409, "sesion_inactiva"],
    [reservar(otraPropia, itemPropio), 404, "item_no_encontrado"],
    [reservar(sid, itemAjeno), 404, "item_no_encontrado"],
    [reservar(sid, "bbbbbbbb-0000-4000-8000-00000000ffff"), 404, "item_no_encontrado"],
    [reservar(sid, "no-es-uuid"), 400, "item_invalido"],
    [reservar("no-es-uuid", itemPropio), 400, "sesion_invalida"],
    [{ ...reservar(sid, itemPropio), restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, 400, "accion_invalida"],
    [{ ...reservar(sid, itemPropio), modo: "food" }, 501, "modo_no_disponible"],
    [{ accion: "borrar", wineId: v(1) }, 400, "accion_invalida"],
    [quitar(vinoAjeno), 404, "vino_no_encontrado"],
    [quitar("cccccccc-0000-4000-8000-00000000ffff"), 404, "vino_no_encontrado"],
    [quitar("no-es-uuid"), 400, "vino_invalido"],
  ]) {
    const r = await e.pedir(body);
    assert.equal(r.codigo, codigo, cod);
    assert.equal(r.cuerpo.codigo, cod);
  }
  assert.equal(e.base.escrituras.length, antes);
  assert.equal(e.base.tablas.user_knowledge.length, 0);
});

test("ítem cuyo vino ya no está en la cava: 404 vino_no_encontrado, sin reserva", async () => {
  const e = entorno(CAVA());
  const t1 = await e.pedir({ modo: "cellar" });
  e.base.tablas.wines = e.base.tablas.wines.filter((w) => w.id !== v(1)); // vino borrado después de recomendarlo
  const r = await e.pedir(reservar(t1.cuerpo.sesionId, e.itemDe(t1, v(1))));
  assert.deepEqual([r.codigo, r.cuerpo.codigo], [404, "vino_no_encontrado"]);
  assert.equal(e.reservas(v(1)).length, 0);
});

test("escrituras del bloque: solo reservas explícitas en user_knowledge; ni inferencias ni eventos", async () => {
  const e = entorno({
    ...CAVA(),
    conocimiento: [{ id: "k-inf", knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", meaning: "x", source_type: "behavior", evidence: { a: 1 } }],
  });
  const t1 = await e.pedir({ modo: "cellar" });
  const desde = e.base.escrituras.length;
  await e.pedir(reservar(t1.cuerpo.sesionId, e.itemDe(t1, v(1))));
  await e.pedir(quitar(v(1)));
  const nuevas = e.base.escrituras.slice(desde);
  assert.deepEqual(nuevas.map((w) => `${w.tabla}:${w.op}`), [
    "user_knowledge:upsert", "recommendation_sessions:update", "recommendation_items:insert", "user_knowledge:update",
  ]);
  for (const w of nuevas.filter((x) => x.tabla === "user_knowledge")) {
    for (const f of w.filas) {
      assert.deepEqual([f.knowledge_type, f.scope_type, f.source_type, f.value?.marca], ["explicit", "wine", "recommender", "reserva"]);
    }
  }
  assert.equal(e.base.tablas.user_knowledge.filter((k) => k.knowledge_type === "inference").length, 1, "la inferencia previa no se toca");
  assert.equal(e.base.tablas.recommendation_events.length, 0);
});

// 7.4-B4: lógica pura de la pantalla «Elegir de mi cava» y su cliente de API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { variedadesParaEvitar, avisoIncierto, estadoSinCandidatos, crearSecuencia, claveTanda, FASES } from "../../src/que-tomo/flujo.js";
import { llamarQueTomo, pedirPrimeraTanda, refinarPorVariedad, reservarVino, quitarReserva, registrarEvento, leerReservaDeVino } from "../../src/que-tomo/api.js";

test("variedades para evitar: solo las de vinos con stock, sin las aplicadas, cortes sí, ambiguas no", () => {
  const vinos = [
    { varietal: "Malbec", stock: 2 },
    { varietal: "malbec", stock: 1 },
    { varietal: "Malbec - Syrah", stock: 1 },
    { varietal: "Cabernet", stock: 3 },
    { varietal: "Torrontes", stock: 1 },
    { varietal: "Merlot", stock: 0 },
    { varietal: null, stock: 5 },
  ];
  const r = variedadesParaEvitar(vinos);
  // Más vinos primero; a igual cantidad, el orden del catálogo (Torrontés antes que Syrah).
  assert.deepEqual(r, [
    { id: "malbec", etiqueta: "Malbec", vinos: 3 },
    { id: "torrontes", etiqueta: "Torrontés", vinos: 1 },
    { id: "syrah", etiqueta: "Syrah", vinos: 1 },
  ]);
  assert.equal(r.some((x) => x.id.startsWith("cabernet")), false, "«Cabernet» es ambiguo");
  assert.equal(r.some((x) => x.id === "merlot"), false, "sin stock");
  // Con «Malbec» aplicado, el corte Malbec - Syrah ya quedó afuera: Syrah no se ofrece.
  assert.deepEqual(variedadesParaEvitar(vinos, [{ clave: "malbec" }]).map((x) => x.id), ["torrontes"]);
  assert.deepEqual(variedadesParaEvitar([]), []);
});

test("aviso de coincidencia incierta: nunca presenta la exclusión como garantizada", () => {
  const filtros = [{ clave: "malbec", etiqueta: "Malbec" }, { clave: "syrah", etiqueta: "Syrah" }];
  assert.equal(avisoIncierto({ inciertas: [] }, filtros), null);
  assert.equal(avisoIncierto({ inciertas: [{ clave: "malbec", coincidencia: "no_evaluable" }] }, filtros),
    "No sabemos si este vino es Malbec: su varietal no está registrado.");
  assert.equal(avisoIncierto({ inciertas: [{ clave: "malbec", coincidencia: "posible" }, { clave: "syrah", coincidencia: "no_evaluable" }] }, filtros),
    "No podemos confirmar si este vino es Malbec o Syrah: su varietal no lo indica con claridad.");
});

test("estados sin resultados: texto y acción que resuelve cada caso", () => {
  const acc = (m, o) => estadoSinCandidatos(m, o).accion;
  assert.equal(acc("biblioteca_vacia"), "agregar_vino");
  assert.equal(acc("sin_stock"), "volver");
  assert.equal(acc("excluidos_por_filtro"), "nueva_consulta");
  assert.equal(acc("excluidos_por_reserva", { hayReservaReciente: true }), "deshacer_reserva");
  assert.equal(acc("excluidos_por_reserva"), "volver");
  assert.equal(acc("excluidos_por_restriccion"), "volver");
  assert.notEqual(estadoSinCandidatos("sin_stock").titulo, estadoSinCandidatos("excluidos_por_filtro").titulo);
  assert.notEqual(estadoSinCandidatos("sin_stock").titulo, estadoSinCandidatos("excluidos_por_reserva").titulo);
});

test("secuencia: una consulta nueva vuelve viejas las respuestas anteriores", () => {
  const s = crearSecuencia();
  const a = s.nueva();
  assert.equal(s.vigente(a), true);
  const b = s.nueva();
  assert.equal(s.vigente(a), false);
  assert.equal(s.vigente(b), true);
  assert.equal(claveTanda("s", 2), "s:2");
  assert.equal(FASES.RESERVA_SIN_TANDA, "reserva_sin_tanda");
});

function fetchFalso(respuesta) {
  const llamadas = [];
  const f = async (url, init) => {
    llamadas.push({ url, init, body: JSON.parse(init.body) });
    if (respuesta instanceof Error) throw respuesta;
    return { status: respuesta.status, json: async () => respuesta.cuerpo };
  };
  return { f, llamadas };
}

test("cliente: cuerpos exactos de cada pedido, con el token del usuario", async () => {
  const { f, llamadas } = fetchFalso({ status: 200, cuerpo: { estado: "ok" } });
  await pedirPrimeraTanda("tk", { fetchImpl: f });
  await refinarPorVariedad("tk", "s1", "malbec", { fetchImpl: f });
  await reservarVino("tk", "s1", "i1", { fetchImpl: f });
  await quitarReserva("tk", "w1", { fetchImpl: f });
  await registrarEvento("tk", { sesionId: "s1", tipo: "selected", itemId: "i1" }, { fetchImpl: f });
  assert.deepEqual(llamadas.map((l) => l.body), [
    { modo: "cellar" },
    { modo: "cellar", sesionId: "s1", restriccion: { alcance: { tipo: "grape", valor: "malbec" } } },
    { accion: "reservar", modo: "cellar", sesionId: "s1", itemId: "i1" },
    { accion: "quitar_reserva", wineId: "w1" },
    { accion: "evento", sesionId: "s1", tipo: "selected", itemId: "i1" },
  ]);
  assert.equal(llamadas.every((l) => l.url === "/api/que-tomo" && l.init.method === "POST" && l.init.headers.Authorization === "Bearer tk"), true);
});

test("cliente: un error de red no lanza (status 0) y la medición nunca interrumpe", async () => {
  const { f } = fetchFalso(new TypeError("fetch failed"));
  assert.deepEqual(await llamarQueTomo("tk", { modo: "cellar" }, { fetchImpl: f }), { status: 0, cuerpo: null });
  assert.deepEqual(await registrarEvento("tk", { tipo: "shown" }, { fetchImpl: f }), { status: 0, cuerpo: null });
  const sinJson = async () => ({ status: 502, json: async () => { throw new Error("no json"); } });
  assert.deepEqual(await llamarQueTomo("tk", {}, { fetchImpl: sinJson }), { status: 502, cuerpo: null });
});

test("ficha: lectura de la reserva persistida por la marca en value", async () => {
  const filtros = [];
  const cliente = (data, error = null) => ({
    from(t) {
      filtros.push(["from", t]);
      const q = { select() { return q; }, eq(k, v) { filtros.push([k, v]); return q; }, then(ok) { return Promise.resolve({ data, error }).then(ok); } };
      return q;
    },
  });
  assert.deepEqual(await leerReservaDeVino(cliente([{ id: "k" }]), { userId: "u", wineId: "w" }), { ok: true, reservado: true });
  assert.deepEqual(filtros, [["from", "user_knowledge"], ["user_id", "u"], ["wine_id", "w"], ["knowledge_type", "explicit"], ["scope_type", "wine"], ["status", "active"], ["value->>marca", "reserva"]]);
  assert.deepEqual(await leerReservaDeVino(cliente([]), { userId: "u", wineId: "w" }), { ok: true, reservado: false });
  assert.deepEqual(await leerReservaDeVino(cliente(null, { message: "x" }), { userId: "u", wineId: "w" }), { ok: false });
});

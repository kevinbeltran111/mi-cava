// =============================================================================
// Integración 7.3-B: motor de conocimiento sobre el contexto REAL que produce
// 7.3-A (construirContexto con el token del usuario, RLS real) y los datos
// sintéticos de tests/que-tomo/seed.sql. Solo lectura.
// Lo lanza supabase/tests/run_que_tomo_integracion.sh. Sin IT_REST_URL /
// IT_JWT_SECRET / IT_DB se omite.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { construirContexto } from "../../api/_que-tomo/contexto.js";
import { construirConocimiento, seleccionarParaConsulta, prepararCambios } from "../../api/_que-tomo/conocimiento/index.js";

const REST = process.env.IT_REST_URL;
const SECRET = process.env.IT_JWT_SECRET;
const DB = process.env.IT_DB;
const skip = !REST || !SECRET || !DB ? "sin IT_REST_URL / IT_JWT_SECRET / IT_DB (usar run_que_tomo_integracion.sh)" : false;

// Usuarios y filas de tests/que-tomo/seed.sql
const X = "00000000-0000-0000-0000-0000000073a1";
const Y = "00000000-0000-0000-0000-0000000073b1";
const E = "00000000-0000-0000-0000-0000000073e1";
const WY = "b0000000-0000-0000-0000-000000000001";
const INF_X = "d0000000-0000-0000-0000-000000000003";

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function firmar(payload) {
  const h = b64url({ alg: "HS256", typ: "JWT" });
  const p = b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

// Proxy mínimo: supabase-js agrega /rest/v1 a la URL.
let server;
let URL_SB;
before(async () => {
  if (skip) return;
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!req.url.startsWith("/rest/v1")) { res.writeHead(404); return res.end(); }
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const r = await fetch(REST + req.url.slice("/rest/v1".length), { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const out = {};
    r.headers.forEach((v, k) => { if (k !== "content-encoding" && k !== "content-length") out[k] = v; });
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  URL_SB = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const clienteUsuario = (uid) => createClient(URL_SB, firmar({ role: "anon" }), {
  ...opciones,
  global: { headers: { Authorization: `Bearer ${firmar({ role: "authenticated", sub: uid, aud: "authenticated" })}` } },
});
const sql = (q) => execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", q], { encoding: "utf8" }).trim();
const huella = () => sql(`select md5(coalesce(string_agg(to_jsonb(k)::text, ',' order by id), '')) from public.user_knowledge k`);

async function conocimientoDe(uid, pedido = uid) {
  const r = await construirContexto(clienteUsuario(uid), pedido);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  return { contexto: r.contexto, ...construirConocimiento(r.contexto) };
}

test("perfil de X sobre RLS real: nada de Y", { skip }, async () => {
  const antes = huella();
  const k = await conocimientoDe(X);
  const texto = JSON.stringify(k.perfil);
  assert.equal(texto.includes(WY), false);
  assert.equal(texto.includes("secreto de Y"), false);
  assert.equal(texto.includes("conocimiento de Y"), false);
  assert.deepEqual(k.perfil.declarado.variedades, ["malbec", "cabernet_franc"]);
  assert.equal(huella(), antes); // solo lectura
});

test("con el token de X, pedir el user_id de Y devuelve un perfil vacío", { skip }, async () => {
  const k = await conocimientoDe(X, Y);
  assert.deepEqual(k.perfil.declarado, { registrada: false });
  assert.equal(k.perfil.hechos.vinos, 0);
  assert.deepEqual(k.perfil.explicito.preferencias, []);
});

test("conocimiento de X: explícito sin polaridad, restricción general, inferencia reconstruida", { skip }, async () => {
  const { perfil } = await conocimientoDe(X);
  assert.deepEqual(perfil.explicito.preferencias.map((p) => [p.alcance.clave, p.polaridad.estado]), [["torrontes", "pendiente_contrato_value"]]);
  assert.deepEqual(perfil.restricciones.persistentes.map((r) => r.aplicacion), ["requiere_interpretacion"]);
  const inf = perfil.inferencias.almacenadas.find((i) => i.id === INF_X);
  assert.equal(inf.explicacion.estado, "completa");
  assert.ok(perfil.contradicciones.some((c) => c.tipo === "explicita_no_evaluable" && c.alcance.clave === "torrontes"));
});

test("selección de X: sin datos de Y, sin id de usuario ni precio", { skip }, async () => {
  const k = await conocimientoDe(X);
  for (const modo of ["food", "cellar", "discovery"]) {
    const r = seleccionarParaConsulta(k, { modo, temporal: { comida: "Asado" } });
    assert.equal(r.ok, true);
    const t = JSON.stringify(r.seleccion);
    assert.equal(t.includes(X), false);
    assert.equal(t.includes(WY), false);
    assert.equal(t.includes("18000"), false);
  }
});

test("usuario sin biblioteca ni preferencias (E)", { skip }, async () => {
  const k = await conocimientoDe(E);
  assert.deepEqual(k.perfil.declarado, { registrada: false });
  assert.deepEqual(k.perfil.inferencias.calculadas.cepas.grupos, []);
});

test("simulación de persistencia: sin reglas, nada; y no escribe", { skip }, async () => {
  const antes = huella();
  const k = await conocimientoDe(X);
  assert.equal(prepararCambios(k).estado, "sin_regla_validada");
  assert.equal(huella(), antes);
});

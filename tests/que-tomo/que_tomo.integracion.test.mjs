// =============================================================================
// Integración 7.3-A: POST /api/que-tomo con supabase-js, PostgREST y
// PostgreSQL LOCALES (RLS real) y datos sintéticos (tests/que-tomo/seed.sql).
// Lo lanza supabase/tests/run_que_tomo_integracion.sh. Sin IT_REST_URL /
// IT_JWT_SECRET / IT_DB se omite.
//
// 7.4-B1: el motor vigente es motorCellar («Elegir de mi cava», primera
// tanda) y se prueba tal cual. Donde hace falta forzar una salida concreta
// (validación, errores) se inyecta un motor SINTÉTICO.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { crearHandler } from "../../api/que-tomo.js";
import { construirContexto } from "../../api/_que-tomo/contexto.js";
import { recuperarCandidatos } from "../../api/_que-tomo/candidatos.js";
import { validarSalidaMotor } from "../../api/_que-tomo/motor.js";
import { prepararCellar, explicar } from "../../api/_que-tomo/motor_cellar.js";
import { idReserva } from "../../api/_que-tomo/conocimiento/reserva.js";
import { crearSesion, registrarItems } from "../../api/_que-tomo/sesiones.js";

const REST = process.env.IT_REST_URL;
const SECRET = process.env.IT_JWT_SECRET;
const DB = process.env.IT_DB;
const skip = !REST || !SECRET || !DB ? "sin IT_REST_URL / IT_JWT_SECRET / IT_DB (usar run_que_tomo_integracion.sh)" : false;

const X = "00000000-0000-0000-0000-0000000073a1";
const Y = "00000000-0000-0000-0000-0000000073b1";
const V = "00000000-0000-0000-0000-0000000073c1";
const E = "00000000-0000-0000-0000-0000000073e1";
const WX = {
  favorito: "a0000000-0000-0000-0000-000000000001",
  stockSinTomar: "a0000000-0000-0000-0000-000000000002",
  tomadoMal: "a0000000-0000-0000-0000-000000000003",
  tomadoSinPuntuar: "a0000000-0000-0000-0000-000000000004",
};
const WY = "b0000000-0000-0000-0000-000000000001";
// 7.4-B1 (ver el final de seed.sql)
const S = "00000000-0000-0000-0000-0000000074a1";
const R = "00000000-0000-0000-0000-0000000074b1";
const O = "00000000-0000-0000-0000-0000000074c1";
const M = "00000000-0000-0000-0000-0000000074d1";
const WO = "f4000000-0000-0000-0000-0000000000c1";
const WM = {
  favorito: "f4000000-0000-0000-0000-0000000000d1",
  seisBotellas: "f4000000-0000-0000-0000-0000000000d2",
  bienPuntuado: "f4000000-0000-0000-0000-0000000000d3",
  paraExplorar: "f4000000-0000-0000-0000-0000000000d4",
  excluido: "f4000000-0000-0000-0000-0000000000d5",
  sinStock: "f4000000-0000-0000-0000-0000000000d6",
  sinPuntuar: "f4000000-0000-0000-0000-0000000000d7",
};

// ---------------------------------------------------------------------------
// JWT HS256 de prueba
// ---------------------------------------------------------------------------
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function firmar(payload, secreto = SECRET) {
  const h = b64url({ alg: "HS256", typ: "JWT" });
  const p = b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  const s = crypto.createHmac("sha256", secreto).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
const tokenDe = (uid) => firmar({ role: "authenticated", sub: uid, aud: "authenticated" });
const ANON = () => firmar({ role: "anon" });
const SERVICE = () => firmar({ role: "service_role" });

function verificar(token) {
  try {
    const [h, p, s] = String(token).split(".");
    const esperada = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
    if (!s || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(esperada))) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.role !== "authenticated" || !payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gateway local que imita la URL de Supabase:
//   /rest/v1/*      → PostgREST (RLS real, verifica el JWT)
//   /auth/v1/user   → valida firma y vencimiento como GoTrue
// ---------------------------------------------------------------------------
let server;
let URL_SB;
before(async () => {
  if (skip) return;
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (req.url.startsWith("/auth/v1/user")) {
      const tok = String(req.headers.authorization || "").replace(/^Bearer /, "");
      const p = verificar(tok);
      res.writeHead(p ? 200 : 401, { "content-type": "application/json" });
      return res.end(JSON.stringify(p ? { id: p.sub, aud: "authenticated", role: "authenticated" } : { msg: "invalid JWT" }));
    }
    if (!req.url.startsWith("/rest/v1")) {
      res.writeHead(404);
      return res.end();
    }
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const r = await fetch(REST + req.url.slice("/rest/v1".length), {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const out = {};
    r.headers.forEach((v, k) => { if (k !== "content-encoding" && k !== "content-length") out[k] = v; });
    res.writeHead(r.status, out);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  URL_SB = `http://127.0.0.1:${server.address().port}`;
  estadoInicial = huellaIntegridad();
});

let estadoInicial;
after(() => server?.close());

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const sql = (q) => execFileSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", q], { encoding: "utf8" }).trim();
const sesionesDe = (uid) => Number(sql(`select count(*) from public.recommendation_sessions where user_id = '${uid}'`));
// Huella de todo lo que ni 7.3-A ni 7.4-B1 deben modificar.
const huellaIntegridad = () => sql(`
  select md5(string_agg(t, '|' order by t)) from (
    select 'w:' || md5(string_agg(to_jsonb(w)::text, ',' order by id)) as t from public.wines w
    union all select 'p:' || md5(string_agg(to_jsonb(p)::text, ',' order by wine_id)) from public.wine_privado p
    union all select 'c:' || md5(string_agg(to_jsonb(c)::text, ',' order by id)) from public.consumos c
    union all select 'k:' || md5(string_agg(to_jsonb(k)::text, ',' order by id)) from public.user_knowledge k
      where not coalesce(k.value ->> 'marca' = 'reserva', false)
    union all select 'u:' || md5(string_agg(to_jsonb(u)::text, ',' order by user_id)) from public.user_preferences u
    union all select 'e:' || count(*)::text from public.recommendation_events
  ) s`);

const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const clienteUsuario = (uid) => createClient(URL_SB, ANON(), { ...opciones, global: { headers: { Authorization: `Bearer ${tokenDe(uid)}` } } });
const clienteServicio = () => createClient(URL_SB, SERVICE(), opciones);

function handler(deps = {}) {
  return crearHandler({
    entorno: { VITE_SUPABASE_URL: URL_SB, VITE_SUPABASE_ANON_KEY: ANON(), SUPABASE_SERVICE_ROLE_KEY: SERVICE() },
    ...deps,
  });
}

async function llamar({ token, body = { modo: "cellar" }, deps } = {}) {
  const res = { codigo: null, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  await handler(deps)({ method: "POST", headers, body }, res);
  return res;
}

// Motor SINTÉTICO: recomienda los wineIds indicados, con textos fijos. Solo
// sirve para verificar el circuito; no es lógica de recomendación.
function motorSintetico(ids, extra = {}) {
  const llamadas = [];
  const motor = async (entrada) => {
    llamadas.push(entrada);
    return {
      modo: "cellar",
      suficiencia: "sufficient",
      contextoSesion: { prueba: true },
      engineVersion: "prueba-7.3-A",
      model: null,
      recomendaciones: ids.map((wineId, i) => ({ wineId, relationship: "owned", explicacion: `prueba ${i + 1}`, signals: { prueba: true } })),
      ...extra,
    };
  };
  return { motor, llamadas };
}

// ---------------------------------------------------------------------------
// Autenticación y rol
// ---------------------------------------------------------------------------
test("autenticación: sin token, firma falsa, vencido o anon → 401", { skip }, async () => {
  assert.equal((await llamar({})).codigo, 401);
  assert.equal((await llamar({ token: firmar({ role: "authenticated", sub: X }, "otro-secreto") })).codigo, 401);
  assert.equal((await llamar({ token: firmar({ role: "authenticated", sub: X, exp: Math.floor(Date.now() / 1000) - 10 }) })).codigo, 401);
  assert.equal((await llamar({ token: ANON() })).codigo, 401);
  assert.equal(sesionesDe(X), 0);
});

test("viewer (sin cava) → 403 sin_cava, sin leer su contexto ni crear sesión", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([]);
  const r = await llamar({ token: tokenDe(V), deps: { motor } });
  assert.equal(r.codigo, 403);
  assert.equal(r.cuerpo.codigo, "sin_cava");
  assert.equal(llamadas.length, 0);
  assert.equal(sesionesDe(V), 0);
});

// ---------------------------------------------------------------------------
// Sin candidatos (7.4-B1): ni motor ni sesión
// ---------------------------------------------------------------------------
test("sin motor configurado: 501 motor_pendiente, sin sesión ni recomendaciones simuladas", { skip }, async () => {
  const r = await llamar({ token: tokenDe(X), deps: { motor: null } });
  assert.equal(r.codigo, 501);
  assert.equal(r.cuerpo.codigo, "motor_pendiente");
  assert.equal(r.cuerpo.recomendaciones, undefined);
  assert.equal(sesionesDe(X), 0);
});

test("modos fuera de alcance: food / discovery → 501, sin modo → 400; sin sesión", { skip }, async () => {
  for (const [body, codigo] of [[{ modo: "food", consulta: "asado" }, 501], [{ modo: "discovery" }, 501], [{ consulta: "¿Qué tomo?" }, 400]]) {
    const { motor, llamadas } = motorSintetico([WX.favorito]);
    const r = await llamar({ token: tokenDe(X), body, deps: { motor } });
    assert.equal(r.codigo, codigo, JSON.stringify(body));
    assert.equal(llamadas.length, 0);
  }
  assert.equal(sesionesDe(X), 0);
});

test("«hoy no quiero Malbec» (X tiene un Malbec elegible): 400 refinamiento_no_disponible, sin motor, sesión ni items", { skip }, async () => {
  const antes = sql(`select count(*) || '|' || (select count(*) from public.recommendation_items) from public.recommendation_sessions`);
  for (const consulta of ["hoy no quiero Malbec", "  otra cosa  "]) {
    const { motor, llamadas } = motorSintetico([WX.favorito]);
    const r = await llamar({ token: tokenDe(X), body: { modo: "cellar", consulta }, deps: { motor } });
    assert.equal(r.codigo, 400);
    assert.equal(r.cuerpo.codigo, "refinamiento_no_disponible");
    assert.equal(llamadas.length, 0);
  }
  assert.equal(sql(`select count(*) || '|' || (select count(*) from public.recommendation_items) from public.recommendation_sessions`), antes);
});

for (const [nombre, uid, motivo] of [
  ["biblioteca vacía", E, "biblioteca_vacia"],
  ["vinos sin stock", S, "sin_stock"],
  ["lo disponible está excluido por una restricción confirmada", R, "excluidos_por_restriccion"],
]) {
  test(`${nombre}: sin_candidatos ${motivo}, no llama al motor ni crea sesión`, { skip }, async () => {
    const { motor, llamadas } = motorSintetico([]);
    const r = await llamar({ token: tokenDe(uid), deps: { motor } });
    assert.equal(r.codigo, 200);
    assert.equal(r.cuerpo.estado, "sin_candidatos");
    assert.equal(r.cuerpo.motivo, motivo);
    assert.deepEqual(r.cuerpo.recomendaciones, []);
    assert.equal(llamadas.length, 0);
    assert.equal(sesionesDe(uid), 0);
  });
}

// ---------------------------------------------------------------------------
// Contexto personal y aislamiento (RLS)
// ---------------------------------------------------------------------------
test("contexto de X: su biblioteca, preferencias y conocimiento activo; nada de Y", { skip }, async () => {
  const r = await construirContexto(clienteUsuario(X), X);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const c = r.contexto;
  assert.deepEqual(c.biblioteca.map((v) => v.id).sort(), Object.values(WX).sort());
  assert.deepEqual(c.preferencias.declaradas.tipos, { respuesta: "answered", elegidos: ["tinto"], exploracion: true });
  assert.deepEqual(c.preferencias.explicitas.map((k) => k.id), ["d0000000-0000-0000-0000-000000000001"]); // el revocado no
  assert.deepEqual(c.restricciones.map((k) => k.id), ["d0000000-0000-0000-0000-000000000002"]);
  assert.deepEqual(c.inferencias.map((k) => k.id), ["d0000000-0000-0000-0000-000000000003"]);
  const texto = JSON.stringify(c);
  assert.equal(texto.includes(WY), false);
  assert.equal(texto.includes("secreto de Y"), false);
  assert.equal(texto.includes("conocimiento de Y"), false);
});

test("stock ≠ agrado y consumo ≠ satisfacción, con datos de la base", { skip }, async () => {
  const { contexto } = await construirContexto(clienteUsuario(X), X);
  const v = (id) => contexto.biblioteca.find((w) => w.id === id);
  assert.deepEqual(v(WX.stockSinTomar).hechos.disponibilidad, { stock: 6, disponible: true, registrada: true });
  assert.equal(v(WX.stockSinTomar).senales.favorito, false);
  assert.equal(v(WX.stockSinTomar).senales.valoracion.promedio, null);
  assert.deepEqual(v(WX.tomadoSinPuntuar).senales.valoracion, { puntuadas: 0, sinPuntuar: 1, promedio: null });
  assert.deepEqual(v(WX.tomadoMal).senales.valoracion, { puntuadas: 1, sinPuntuar: 1, promedio: 1.5 });
  assert.equal(v(WX.favorito).senales.favorito, true);
  assert.equal(v(WX.favorito).senales.valoracion.promedio, 4.75);
  assert.deepEqual(v(WX.favorito).hechos.precioPagado, { valor: 18000, naturaleza: "historico" });
  assert.deepEqual(v(WX.favorito).conocimientoAsociado, ["d0000000-0000-0000-0000-000000000003"]);
});

test("RLS: con el token de X no se leen datos de Y aunque se pida su user_id", { skip }, async () => {
  const r = await construirContexto(clienteUsuario(X), Y);
  assert.equal(r.ok, true);
  assert.equal(r.contexto.biblioteca.length, 0);
  assert.deepEqual(r.contexto.preferencias.declaradas, { registrada: false });
  assert.equal(r.contexto.preferencias.explicitas.length, 0);
});

test("el usuario sale del token: un user_id en el cuerpo se ignora", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([WX.favorito]);
  const r = await llamar({ token: tokenDe(X), body: { modo: "cellar", userId: Y, user_id: Y }, deps: { motor } });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(llamadas[0].candidatos.map((c) => c.wineId).sort(), [WX.favorito, WX.stockSinTomar].sort());
  assert.equal(JSON.stringify(llamadas[0]).includes(WY), false);
  assert.equal(sql(`select user_id from public.recommendation_sessions where id = '${r.cuerpo.sesionId}'`), X);
});

test("fallo al leer el contexto → 503 contexto_no_disponible, sin motor ni sesión", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([WX.favorito]);
  const antes = sesionesDe(X);
  const crearCliente = (url, key, opts) =>
    createClient(url, key, {
      ...opts,
      global: {
        ...(opts?.global || {}),
        fetch: async (input, init) => (String(input).includes("/rest/v1/consumos") ? Promise.reject(new TypeError("fetch failed")) : fetch(input, init)),
      },
    });
  const r = await llamar({ token: tokenDe(X), deps: { motor, crearCliente } });
  assert.equal(r.codigo, 503);
  assert.equal(r.cuerpo.codigo, "contexto_no_disponible");
  assert.equal(llamadas.length, 0);
  assert.equal(sesionesDe(X), antes);
});

// ---------------------------------------------------------------------------
// Circuito completo con motor sintético
// ---------------------------------------------------------------------------
test("motor sintético: sesión e items reales, identidad desde la base, consulta en blanco = sin consulta", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([WX.stockSinTomar, WX.favorito]);
  const r = await llamar({ token: tokenDe(X), body: { modo: "cellar", consulta: "   " }, deps: { motor } });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.estado, "ok");
  assert.equal(r.cuerpo.tanda, 1);
  assert.equal(llamadas[0].consulta, null);
  // 7.4-B1: el motor recibe solo los elegibles (stock > 0), no toda la biblioteca.
  assert.equal(llamadas[0].candidatos.length, 2);
  assert.equal(llamadas[0].contexto, undefined);

  const [a, b] = r.cuerpo.recomendaciones;
  assert.deepEqual([a.posicion, a.rol, a.wineId, a.vino.nombre, a.disponible, a.stock, a.consumidoAntes, a.favorito],
    [1, "principal", WX.stockSinTomar, "X Stock sin tomar", true, 6, false, false]);
  assert.deepEqual([b.posicion, b.rol, b.wineId, b.disponible, b.consumidoAntes, b.vecesConsumido],
    [2, "alternativa", WX.favorito, true, true, 2]);

  const s = JSON.parse(sql(`select to_jsonb(s) from public.recommendation_sessions s where id = '${r.cuerpo.sesionId}'`));
  assert.equal(s.user_id, X);
  assert.equal(s.mode, "cellar");
  assert.equal(s.status, "active");
  assert.equal(s.initial_input, null);
  assert.deepEqual(s.context, { prueba: true, tanda: 1, revision: 1, temporal: { restricciones: [] } });
  assert.equal(s.engine_version, "prueba-7.3-A");

  const items = JSON.parse(sql(`select json_agg(to_jsonb(i) order by position) from public.recommendation_items i where session_id = '${r.cuerpo.sesionId}'`));
  assert.deepEqual(items.map((i) => [i.position, i.batch_no, i.relationship, i.wine_id]),
    [[1, 1, "owned", WX.stockSinTomar], [2, 1, "owned", WX.favorito]]);
  assert.deepEqual(items[1].wine_identity, { nombre: "X Favorito", bodega: "Bodega Uno", varietal: "Malbec", anada: 2020, lugar: "Luján de Cuyo", region: "Mendoza" });

  // X lo lee por RLS; Y no.
  const propios = await clienteUsuario(X).from("recommendation_items").select("id").eq("session_id", r.cuerpo.sesionId);
  assert.equal(propios.data.length, 2);
  const ajenos = await clienteUsuario(Y).from("recommendation_sessions").select("id").eq("id", r.cuerpo.sesionId);
  assert.equal(ajenos.data.length, 0);
});

test("motor sintético que recomienda un vino propio SIN stock → 502 motor_invalido, nada guardado", { skip }, async () => {
  const antes = sesionesDe(X);
  const { motor } = motorSintetico([WX.tomadoMal]);
  const r = await llamar({ token: tokenDe(X), deps: { motor } });
  assert.equal(r.codigo, 502);
  assert.equal(r.cuerpo.codigo, "motor_invalido");
  assert.equal(sesionesDe(X), antes);
});

test("motor que recomienda un vino de otro usuario → 502 motor_invalido, nada guardado", { skip }, async () => {
  const antes = sesionesDe(X);
  const { motor } = motorSintetico([WX.favorito, WY]);
  const r = await llamar({ token: tokenDe(X), deps: { motor } });
  assert.equal(r.codigo, 502);
  assert.equal(r.cuerpo.codigo, "motor_invalido");
  assert.equal(sesionesDe(X), antes);
});

test("motor que inventa una botella → 502 motor_invalido, nada guardado", { skip }, async () => {
  const antes = sesionesDe(X);
  const { motor } = motorSintetico(["e0000000-0000-0000-0000-00000000dead"]);
  const r = await llamar({ token: tokenDe(X), deps: { motor } });
  assert.equal(r.codigo, 502);
  assert.equal(sesionesDe(X), antes);
});

test("defensa en la base: un item con vino ajeno lo rechaza el trigger de 7.1", { skip }, async () => {
  const admin = clienteServicio();
  const s = await crearSesion(admin, { userId: X, modo: "cellar", consulta: "prueba trigger", contextoSesion: {} });
  assert.equal(s.ok, true, JSON.stringify(s.error));
  const candidatoFalso = { wineId: WY, identidad: { nombre: "Y Vino ajeno" } };
  const it = await registrarItems(admin, s.sesion.id, [{ posicion: 1, candidato: candidatoFalso, relationship: "owned" }]);
  assert.equal(it.ok, false);
  assert.equal(it.error.tipo, "restriccion");
});

test("errores del motor: excepción → 502, tiempo agotado → 504; sin sesión", { skip }, async () => {
  const antes = sesionesDe(X);
  let r = await llamar({ token: tokenDe(X), deps: { motor: async () => { throw new Error("IA caída"); } } });
  assert.equal(r.codigo, 502);
  assert.equal(r.cuerpo.codigo, "motor_error");
  r = await llamar({ token: tokenDe(X), deps: { motor: () => new Promise(() => {}), tiempoLimiteMotorMs: 50 } });
  assert.equal(r.codigo, 504);
  assert.equal(r.cuerpo.codigo, "motor_tiempo_agotado");
  r = await llamar({ token: tokenDe(X), deps: { motor: async () => "texto libre de IA" } });
  assert.equal(r.codigo, 502);
  assert.equal(r.cuerpo.codigo, "motor_invalido");
  assert.equal(sesionesDe(X), antes);
});

test("falla al guardar los items → 503 y la sesión queda en 'error' con cierre", { skip }, async () => {
  const { motor } = motorSintetico([WX.favorito]);
  const crearCliente = (url, key, opts) =>
    createClient(url, key, {
      ...opts,
      global: {
        ...(opts?.global || {}),
        fetch: async (input, init) =>
          String(input).includes("/rest/v1/recommendation_items") && init?.method === "POST"
            ? Promise.reject(new TypeError("fetch failed"))
            : fetch(input, init),
      },
    });
  const previas = sql(`select coalesce(string_agg(id::text, ','), '') from public.recommendation_sessions where user_id = '${X}'`).split(",").filter(Boolean);
  const r = await llamar({ token: tokenDe(X), body: { modo: "cellar" }, deps: { motor, crearCliente } });
  assert.equal(r.codigo, 503);
  assert.equal(r.cuerpo.codigo, "persistencia_error");
  const nuevas = JSON.parse(sql(`select json_agg(json_build_array(id, status, ended_at is not null)) from public.recommendation_sessions where user_id = '${X}'`))
    .filter(([id]) => !previas.includes(id));
  assert.equal(nuevas.length, 1);
  assert.deepEqual(nuevas[0].slice(1), ["error", true]);
});

test("7.4-B1: recuperarCandidatos sigue describiendo toda la biblioteca, pero los elegibles son solo los que tienen stock", { skip }, async () => {
  const { contexto } = await construirContexto(clienteUsuario(X), X);
  const { resumen } = recuperarCandidatos(contexto);
  assert.deepEqual(resumen, { total: 4, disponibles: 2, consumidosAntes: 3, favoritos: 1 });
  const prep = prepararCellar(contexto);
  assert.deepEqual(prep.entrada.candidatos.map((c) => c.wineId).sort(), [WX.favorito, WX.stockSinTomar].sort());
  // Un vino sin stock ya no es una salida válida, aunque sea de la biblioteca.
  assert.equal(validarSalidaMotor({ modo: "cellar", recomendaciones: [{ wineId: WX.tomadoSinPuntuar, relationship: "known", explicacion: "x" }] }, prep.entrada.candidatos).ok, false);
});

// ---------------------------------------------------------------------------
// 7.4-B1: motor real («Elegir de mi cava») de punta a punta
// ---------------------------------------------------------------------------
const itemsDe = (sesionId) => JSON.parse(sql(`select coalesce(json_agg(to_jsonb(i) order by batch_no, position), '[]') from public.recommendation_items i where session_id = '${sesionId}'`));

test("1 elegible (O): una recomendación, explicación de disponibilidad, tanda 1", { skip }, async () => {
  const r = await llamar({ token: tokenDe(O) });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.recomendaciones.length, 1);
  const [p] = r.cuerpo.recomendaciones;
  assert.deepEqual([p.wineId, p.rol, p.exploracion, p.stock], [WO, "principal", false, 3]);
  assert.equal(p.explicacion, "Está disponible en tu cava: tenés 3 botellas.");
  assert.deepEqual(itemsDe(r.cuerpo.sesionId).map((i) => [i.batch_no, i.position, i.wine_id]), [[1, 1, WO]]);
});

test("2 elegibles (X): favorito como principal y exploración como alternativa", { skip }, async () => {
  const r = await llamar({ token: tokenDe(X) });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(r.cuerpo.recomendaciones.map((x) => [x.wineId, x.rol, x.exploracion]),
    [[WX.favorito, "principal", false], [WX.stockSinTomar, "alternativa", true]]);
  assert.equal(r.cuerpo.recomendaciones[0].explicacion,
    "Lo marcaste como favorito. Lo puntuaste con 4,75 estrellas en promedio, en 2 experiencias. Es un Malbec, una de las variedades que elegiste en tus preferencias.");
  assert.equal(r.cuerpo.recomendaciones[1].explicacion,
    "Es un Cabernet Franc, una de las variedades que elegiste en tus preferencias. Todavía no registraste experiencias con este vino.");
});

test("3 o más elegibles (M): orden de confianza, exploración, restricción de vino, 6 botellas = 1 opción", { skip }, async () => {
  const r = await llamar({ token: tokenDe(M) });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  const c = r.cuerpo;
  assert.deepEqual(c.recomendaciones.map((x) => [x.posicion, x.wineId, x.rol, x.exploracion]), [
    [1, WM.favorito, "principal", false],
    [2, WM.seisBotellas, "alternativa", false],
    [3, WM.paraExplorar, "alternativa", true],
  ]);
  assert.deepEqual(c.recomendaciones.map((x) => x.explicacion), [
    "Lo marcaste como favorito. Lo puntuaste con 4,5 estrellas.",
    "Lo puntuaste con 4,75 estrellas en promedio, en 2 experiencias.",
    "Es un Pinot Noir, una de las variedades que elegiste en tus preferencias. Todavía no registraste experiencias con este vino.",
  ]);
  assert.equal(c.recomendaciones[1].stock, 6);
  const ids = c.recomendaciones.map((x) => x.wineId);
  assert.equal(ids.includes(WM.excluido), false, "excluido por restricción de vino");
  assert.equal(ids.includes(WM.sinStock), false, "sin stock");

  const s = JSON.parse(sql(`select to_jsonb(s) from public.recommendation_sessions s where id = '${c.sesionId}'`));
  assert.deepEqual([s.user_id, s.mode, s.status, s.initial_input, s.engine_version, s.model, s.context_sufficiency],
    [M, "cellar", "active", null, "7.4-B1.1", null, null]);
  assert.deepEqual(s.context, { entrada: "elegir_de_mi_cava", tanda: 1, revision: 1, temporal: { restricciones: [] } });
  const items = itemsDe(c.sesionId);
  assert.deepEqual(items.map((i) => [i.batch_no, i.position, i.relationship, i.wine_id]),
    [[1, 1, "owned", WM.favorito], [1, 2, "owned", WM.seisBotellas], [1, 3, "owned", WM.paraExplorar]]);
  for (const [i, rec] of items.map((it, k) => [it, c.recomendaciones[k]])) {
    assert.equal(i.id, rec.itemId);
    assert.equal(explicar(i.grounding.afirmaciones), rec.explicacion, "la explicación sale del grounding guardado");
    assert.equal(i.signals.rol, rec.rol);
  }
  // Lo ve M por RLS; X no.
  assert.equal((await clienteUsuario(M).from("recommendation_items").select("id").eq("session_id", c.sesionId)).data.length, 3);
  assert.equal((await clienteUsuario(X).from("recommendation_items").select("id").eq("session_id", c.sesionId)).data.length, 0);
});

test("M: cambiar los precios no altera la recomendación (se restauran al final)", { skip }, async () => {
  const quitar = (c) => c.recomendaciones.map(({ itemId, ...x }) => x);
  const antes = await llamar({ token: tokenDe(M) });
  const original = sql(`select json_agg(json_build_array(wine_id, precio) order by wine_id) from public.wine_privado where user_id = '${M}'`);
  sql(`update public.wine_privado set precio = case when precio is null then 1 else precio * 7 + 3 end where user_id = '${M}'`);
  try {
    const despues = await llamar({ token: tokenDe(M) });
    assert.deepEqual(quitar(despues.cuerpo), quitar(antes.cuerpo));
  } finally {
    for (const [wid, precio] of JSON.parse(original)) {
      sql(`update public.wine_privado set precio = ${precio === null ? "null" : precio} where wine_id = '${wid}'`);
    }
  }
});

// ---------------------------------------------------------------------------
// 7.4-B2: refinamiento por variedad en la misma sesión
// ---------------------------------------------------------------------------
const excluir = (sesionId, valor) => ({ modo: "cellar", sesionId, restriccion: { alcance: { tipo: "grape", valor } } });
const ctxSesion = (id) => JSON.parse(sql(`select context from public.recommendation_sessions where id = '${id}'`));
const tandasDe = (id) => JSON.parse(sql(`select coalesce(json_agg(distinct batch_no order by batch_no), '[]') from public.recommendation_items where session_id = '${id}'`));
const contarFilas = () => sql(`select (select count(*) from public.recommendation_sessions) || '|' || (select count(*) from public.recommendation_items) || '|' || (select count(*) from public.user_knowledge) || '|' || (select count(*) from public.recommendation_events)`);
const idsDe = (r) => r.cuerpo.recomendaciones.map((x) => x.wineId);

test("7.4-B2 recorrido (M): tanda 1 con Malbec → excluido en la tanda 2 → una consulta nueva lo vuelve a ofrecer", { skip }, async () => {
  const conocimientoAntes = sql("select count(*) || '|' || (select count(*) from public.recommendation_events) from public.user_knowledge");
  const t1 = await llamar({ token: tokenDe(M) });
  assert.equal(t1.codigo, 200, JSON.stringify(t1.cuerpo));
  assert.equal(idsDe(t1).includes(WM.seisBotellas), true, "la tanda 1 incluye el Malbec");
  const sid = t1.cuerpo.sesionId;

  const t2 = await llamar({ token: tokenDe(M), body: excluir(sid, "Malbec") });
  assert.equal(t2.codigo, 200, JSON.stringify(t2.cuerpo));
  assert.deepEqual([t2.cuerpo.sesionId, t2.cuerpo.tanda], [sid, 2]);
  assert.deepEqual(t2.cuerpo.filtros, [{ tipo: "grape", clave: "malbec", etiqueta: "Malbec" }]);
  assert.deepEqual(idsDe(t2), [WM.favorito, WM.bienPuntuado, WM.paraExplorar]);
  assert.equal(t2.cuerpo.recomendaciones[0].explicacion, "Lo marcaste como favorito. Lo puntuaste con 4,5 estrellas.");
  assert.deepEqual(ctxSesion(sid), { entrada: "elegir_de_mi_cava", tanda: 2, revision: 2, temporal: { restricciones: [{ tipo: "grape", clave: "malbec" }] } });
  assert.deepEqual(tandasDe(sid), [1, 2]);
  const items2 = itemsDe(sid).filter((i) => i.batch_no === 2);
  assert.deepEqual(items2.map((i) => [i.position, i.wine_id]), [[1, WM.favorito], [2, WM.bienPuntuado], [3, WM.paraExplorar]]);
  for (const i of items2) assert.equal(explicar(i.grounding.afirmaciones), t2.cuerpo.recomendaciones[i.position - 1].explicacion);

  const nueva = await llamar({ token: tokenDe(M) });
  assert.notEqual(nueva.cuerpo.sesionId, sid);
  assert.deepEqual([nueva.cuerpo.tanda, nueva.cuerpo.filtros], [1, []]);
  assert.equal(idsDe(nueva).includes(WM.seisBotellas), true, "sin filtros el Malbec vuelve");
  assert.equal(sql("select count(*) || '|' || (select count(*) from public.recommendation_events) from public.user_knowledge"), conocimientoAntes,
    "el refinamiento no escribe user_knowledge ni recommendation_events");
});

test("7.4-B2 filtros acumulados (M): Malbec + Merlot en la tanda 3; repetir no duplica", { skip }, async () => {
  const sid = (await llamar({ token: tokenDe(M) })).cuerpo.sesionId;
  await llamar({ token: tokenDe(M), body: excluir(sid, "malbec") });
  const t3 = await llamar({ token: tokenDe(M), body: excluir(sid, "Merlot") });
  assert.equal(t3.cuerpo.tanda, 3);
  assert.deepEqual(t3.cuerpo.filtros.map((f) => f.clave), ["malbec", "merlot"]);
  assert.equal(idsDe(t3).some((id) => [WM.favorito, WM.seisBotellas].includes(id)), false);
  const t4 = await llamar({ token: tokenDe(M), body: excluir(sid, "Malbec") });
  assert.equal(t4.cuerpo.tanda, 4);
  assert.deepEqual(ctxSesion(sid).temporal.restricciones.map((f) => f.clave), ["malbec", "merlot"]);
  assert.deepEqual(tandasDe(sid), [1, 2, 3, 4]);
});

test("7.4-B2 cero candidatos (X): excluidos_por_filtro conserva sesión y filtros; sin stock es otro motivo", { skip }, async () => {
  const sid = (await llamar({ token: tokenDe(X) })).cuerpo.sesionId;
  const a = await llamar({ token: tokenDe(X), body: excluir(sid, "Malbec") });
  assert.equal(a.cuerpo.tanda, 2);
  const b = await llamar({ token: tokenDe(X), body: excluir(sid, "Cabernet Franc") });
  assert.equal(b.codigo, 200);
  assert.deepEqual([b.cuerpo.estado, b.cuerpo.motivo, b.cuerpo.sesionId, b.cuerpo.tanda], ["sin_candidatos", "excluidos_por_filtro", sid, null]);
  assert.deepEqual(b.cuerpo.filtros.map((f) => f.clave), ["malbec", "cabernet_franc"]);
  assert.deepEqual(ctxSesion(sid), { entrada: "elegir_de_mi_cava", tanda: 2, revision: 3, temporal: { restricciones: [{ tipo: "grape", clave: "malbec" }, { tipo: "grape", clave: "cabernet_franc" }] } });
  assert.equal(sql(`select status from public.recommendation_sessions where id = '${sid}'`), "active");
  assert.deepEqual(tandasDe(sid), [1, 2]);

  const original = sql(`select json_agg(json_build_array(wine_id, stock)) from public.wine_privado where user_id = '${X}'`);
  sql(`update public.wine_privado set stock = 0 where user_id = '${X}'`);
  try {
    const c = await llamar({ token: tokenDe(X), body: excluir(sid, "Syrah") });
    assert.deepEqual([c.cuerpo.estado, c.cuerpo.motivo], ["sin_candidatos", "sin_stock"]);
  } finally {
    for (const [wid, stock] of JSON.parse(original)) sql(`update public.wine_privado set stock = ${stock} where wine_id = '${wid}'`);
  }
});

test("7.4-B2 stock vigente (X): lo agotado sale y lo repuesto entra en la tanda siguiente", { skip }, async () => {
  const sid = (await llamar({ token: tokenDe(X) })).cuerpo.sesionId;
  const original = sql(`select json_agg(json_build_array(wine_id, stock)) from public.wine_privado where user_id = '${X}'`);
  sql(`update public.wine_privado set stock = 0 where wine_id = '${WX.stockSinTomar}'`);
  sql(`update public.wine_privado set stock = 2 where wine_id = '${WX.tomadoSinPuntuar}'`);
  try {
    const r = await llamar({ token: tokenDe(X), body: excluir(sid, "Malbec") });
    assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
    assert.deepEqual(idsDe(r), [WX.tomadoSinPuntuar]);
    assert.equal(r.cuerpo.recomendaciones[0].stock, 2);
  } finally {
    for (const [wid, stock] of JSON.parse(original)) sql(`update public.wine_privado set stock = ${stock} where wine_id = '${wid}'`);
  }
});

test("7.4-B2 sesión ajena, inactiva o entrada inválida: rechazo sin escrituras", { skip }, async () => {
  const sid = (await llamar({ token: tokenDe(X) })).cuerpo.sesionId;
  const cerrada = (await llamar({ token: tokenDe(X) })).cuerpo.sesionId;
  sql(`update public.recommendation_sessions set status = 'completed', ended_at = now() where id = '${cerrada}'`);
  const antes = contarFilas();
  const ctxAntes = ctxSesion(sid);
  for (const [token, body, codigo, cod] of [
    [tokenDe(Y), excluir(sid, "Malbec"), 404, "sesion_no_encontrada"],
    [tokenDe(X), excluir("aaaaaaaa-0000-4000-8000-00000000ffff", "Malbec"), 404, "sesion_no_encontrada"],
    [tokenDe(X), excluir(cerrada, "Malbec"), 409, "sesion_inactiva"],
    [tokenDe(X), excluir("no-es-uuid", "Malbec"), 400, "sesion_invalida"],
    [tokenDe(X), excluir(sid, "Cabernet"), 400, "restriccion_invalida"],
    [tokenDe(X), { modo: "cellar", sesionId: sid, restriccion: { alcance: { tipo: "winery", valor: "Bodega Uno" } } }, 400, "restriccion_invalida"],
    [tokenDe(X), { modo: "cellar", restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, 400, "sesion_requerida"],
    [tokenDe(X), { ...excluir(sid, "Malbec"), consulta: "hoy no quiero Malbec" }, 400, "refinamiento_no_disponible"],
  ]) {
    const r = await llamar({ token, body });
    assert.equal(r.codigo, codigo, cod);
    assert.equal(r.cuerpo.codigo, cod);
  }
  assert.equal(contarFilas(), antes);
  assert.deepEqual(ctxSesion(sid), ctxAntes);
});

test("7.4-B2 solicitudes simultáneas (M): cuatro filtros a la vez, ninguno se pierde y las tandas no se repiten", { skip }, async () => {
  const sid = (await llamar({ token: tokenDe(M) })).cuerpo.sesionId;
  const variedades = ["Malbec", "Merlot", "Syrah", "Tempranillo"];
  const rs = await Promise.all(variedades.map((x) => llamar({ token: tokenDe(M), body: excluir(sid, x) })));
  for (const r of rs) assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(rs.map((r) => r.cuerpo.tanda).sort(), [2, 3, 4, 5]);
  const ctx = ctxSesion(sid);
  assert.deepEqual(ctx.temporal.restricciones.map((f) => f.clave).sort(), ["malbec", "merlot", "syrah", "tempranillo"]);
  assert.deepEqual([ctx.tanda, ctx.revision], [5, 5]);
  assert.deepEqual(tandasDe(sid), [1, 2, 3, 4, 5]);
  const duplicadas = sql(`select count(*) from (select batch_no, position from public.recommendation_items where session_id = '${sid}' group by 1, 2 having count(*) > 1) d`);
  assert.equal(duplicadas, "0");
  // La última tanda ya aplica los cuatro filtros: solo queda el Pinot Noir.
  const ultima = rs.find((r) => r.cuerpo.tanda === 5);
  assert.deepEqual(idsDe(ultima), [WM.paraExplorar]);
});

// ---------------------------------------------------------------------------
// 7.4-B3: «Guardar para una ocasión especial»
// ---------------------------------------------------------------------------
const reservar = (sesionId, itemId) => ({ accion: "reservar", modo: "cellar", sesionId, itemId });
const quitar = (wineId) => ({ accion: "quitar_reserva", wineId });
const itemDe = (r, wineId) => r.cuerpo.recomendaciones.find((x) => x.wineId === wineId).itemId;
const reservasDe = (uid, wineId) => JSON.parse(sql(`select coalesce(json_agg(to_jsonb(k)), '[]') from public.user_knowledge k where user_id = '${uid}' and wine_id = '${wineId}' and value ->> 'marca' = 'reserva'`));
const estadoReservas = (uid, wineId) => reservasDe(uid, wineId).map((k) => [k.id, k.status]);
// Limpieza de prueba (SQL directo, en finally): deja revocada cualquier
// reserva activa de esos vinos aunque una aserción haya cortado el caso. El
// control final de integridad exige que todas las reservas queden revocadas.
const liberarReservas = (uid, wineIds) => sql(`update public.user_knowledge set status = 'revoked'
  where user_id = '${uid}' and wine_id in (${wineIds.map((w) => `'${w}'`).join(",")})
    and value ->> 'marca' = 'reserva' and status = 'active'`);

test("7.4-B3 recorrido (M): reservar → sale de la tanda y de una consulta nueva → quitar → vuelve; reservar de nuevo reactiva la misma fila", { skip }, async () => {
  // Estado inicial explícito: ninguna fila de reserva para este vino (este
  // caso es el primero que reserva WM.favorito y cubre el alta «guardada»).
  assert.deepEqual(estadoReservas(M, WM.favorito), [], "precondición: sin reserva previa de M Favorito");
  try {
    const stockAntes = sql(`select stock from public.wine_privado where wine_id = '${WM.favorito}'`);
    const t1 = await llamar({ token: tokenDe(M) });
    assert.equal(idsDe(t1)[0], WM.favorito);
    const sid = t1.cuerpo.sesionId;
    const item = itemDe(t1, WM.favorito);

    const r = await llamar({ token: tokenDe(M), body: reservar(sid, item) });
    assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
    assert.deepEqual([r.cuerpo.estado, r.cuerpo.tanda, r.cuerpo.sesionId], ["ok", 2, sid]);
    assert.deepEqual(r.cuerpo.reserva, { id: idReserva(M, WM.favorito), wineId: WM.favorito, estado: "guardada" });
    assert.deepEqual(idsDe(r), [WM.seisBotellas, WM.bienPuntuado, WM.paraExplorar]);
    assert.deepEqual(r.cuerpo.filtros, []);
    assert.deepEqual(ctxSesion(sid).temporal, { restricciones: [] });

    const [k] = reservasDe(M, WM.favorito);
    assert.deepEqual(
      [k.id, k.knowledge_type, k.scope_type, k.scope_value, k.source_type, k.status, k.strength, k.meaning],
      [idReserva(M, WM.favorito), "explicit", "wine", null, "recommender", "active", null, "Reservado para una ocasión especial"]);
    assert.deepEqual(k.value, { marca: "reserva", motivo: "ocasion_especial", version: 1 });
    assert.deepEqual(k.wine_snapshot, { nombre: "M Favorito", bodega: "Bodega Norte", varietal: "Merlot", anada: 2020, lugar: "Agrelo", region: "Mendoza" });
    assert.deepEqual(k.evidence, { origen: "elegir_de_mi_cava", sesionId: sid, itemId: item, tanda: 1 });
    assert.equal(sql(`select stock from public.wine_privado where wine_id = '${WM.favorito}'`), stockAntes, "el stock no cambia");
    // M lo ve por RLS; X no.
    assert.equal((await clienteUsuario(M).from("user_knowledge").select("id").eq("id", k.id)).data.length, 1);
    assert.equal((await clienteUsuario(X).from("user_knowledge").select("id").eq("id", k.id)).data.length, 0);

    const nueva = await llamar({ token: tokenDe(M) });
    assert.equal(idsDe(nueva).includes(WM.favorito), false);

    const q = await llamar({ token: tokenDe(M), body: quitar(WM.favorito) });
    assert.deepEqual([q.codigo, q.cuerpo.reserva], [200, { wineId: WM.favorito, estado: "quitada" }]);
    assert.equal(reservasDe(M, WM.favorito)[0].status, "revoked");
    const vuelve = await llamar({ token: tokenDe(M) });
    assert.equal(idsDe(vuelve)[0], WM.favorito);

    const r2 = await llamar({ token: tokenDe(M), body: reservar(vuelve.cuerpo.sesionId, itemDe(vuelve, WM.favorito)) });
    assert.equal(r2.cuerpo.reserva.estado, "reactivada");
    assert.deepEqual(reservasDe(M, WM.favorito).map((x) => [x.id, x.status]), [[idReserva(M, WM.favorito), "active"]]);
    assert.equal((await llamar({ token: tokenDe(M), body: quitar(WM.favorito) })).cuerpo.reserva.estado, "quitada");
    assert.equal((await llamar({ token: tokenDe(M), body: quitar(WM.favorito) })).cuerpo.reserva.estado, "no_habia_reserva");
  } finally {
    liberarReservas(M, [WM.favorito]);
  }
});

test("7.4-B3 último vino disponible (O): sin_candidatos excluidos_por_reserva, sesión activa", { skip }, async () => {
  assert.deepEqual(estadoReservas(O, WO), [], "precondición: sin reserva previa de O Único");
  try {
    const t1 = await llamar({ token: tokenDe(O) });
    const sid = t1.cuerpo.sesionId;
    const r = await llamar({ token: tokenDe(O), body: reservar(sid, itemDe(t1, WO)) });
    assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
    assert.deepEqual([r.cuerpo.estado, r.cuerpo.motivo, r.cuerpo.tanda, r.cuerpo.sesionId], ["sin_candidatos", "excluidos_por_reserva", null, sid]);
    assert.equal(r.cuerpo.reserva.estado, "guardada");
    assert.equal(sql(`select status from public.recommendation_sessions where id = '${sid}'`), "active");
    const nueva = await llamar({ token: tokenDe(O) });
    assert.deepEqual([nueva.cuerpo.estado, nueva.cuerpo.motivo], ["sin_candidatos", "excluidos_por_reserva"]);
    assert.equal((await llamar({ token: tokenDe(O), body: quitar(WO) })).cuerpo.reserva.estado, "quitada");
  } finally {
    liberarReservas(O, [WO]);
  }
});

test("7.4-B3 con filtro previo (X): la reserva se suma sin volverse filtro; al quitarla el vino vuelve en la misma sesión", { skip }, async () => {
  try {
    const t1 = await llamar({ token: tokenDe(X) });
    const sid = t1.cuerpo.sesionId;
    const t2 = await llamar({ token: tokenDe(X), body: excluir(sid, "Malbec") });
    assert.deepEqual(idsDe(t2), [WX.stockSinTomar]);
    const r = await llamar({ token: tokenDe(X), body: reservar(sid, itemDe(t2, WX.stockSinTomar)) });
    assert.deepEqual([r.cuerpo.estado, r.cuerpo.motivo], ["sin_candidatos", "excluidos_por_reserva"]);
    assert.deepEqual(r.cuerpo.filtros.map((f) => f.clave), ["malbec"]);
    assert.deepEqual(ctxSesion(sid).temporal, { restricciones: [{ tipo: "grape", clave: "malbec" }] });

    await llamar({ token: tokenDe(X), body: quitar(WX.stockSinTomar) });
    const t3 = await llamar({ token: tokenDe(X), body: excluir(sid, "Syrah") });
    assert.equal(t3.codigo, 200, JSON.stringify(t3.cuerpo));
    assert.deepEqual(idsDe(t3), [WX.stockSinTomar], "vuelve; el Malbec sigue filtrado");
  } finally {
    liberarReservas(X, [WX.stockSinTomar]);
  }
});

test("7.4-B3 pedidos simultáneos (M): tres reservas del mismo ítem → una fila activa y tandas distintas", { skip }, async () => {
  try {
    const t1 = await llamar({ token: tokenDe(M) });
    const sid = t1.cuerpo.sesionId;
    const item = itemDe(t1, WM.favorito);
    const rs = await Promise.all([1, 2, 3].map(() => llamar({ token: tokenDe(M), body: reservar(sid, item) })));
    for (const r of rs) assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
    assert.deepEqual(rs.map((r) => r.cuerpo.tanda).sort(), [2, 3, 4]);
    const filas = reservasDe(M, WM.favorito);
    assert.deepEqual(filas.map((x) => [x.id, x.status]), [[idReserva(M, WM.favorito), "active"]]);
    assert.deepEqual(tandasDe(sid), [1, 2, 3, 4]);
    await llamar({ token: tokenDe(M), body: quitar(WM.favorito) });
  } finally {
    liberarReservas(M, [WM.favorito]);
  }
});

test("7.4-B3 falla al registrar la tanda (M): reserva revocada que se reactiva, queda activa tras el fallo y el reintento no la duplica", { skip }, async () => {
  const id = idReserva(M, WM.favorito);
  try {
    // Estado inicial explícito, independiente del orden de las pruebas: una
    // fila de reserva REVOCADA para M Favorito, creada y quitada por la API
    // en este mismo caso.
    const prep = await llamar({ token: tokenDe(M) });
    const prepReserva = await llamar({ token: tokenDe(M), body: reservar(prep.cuerpo.sesionId, itemDe(prep, WM.favorito)) });
    assert.equal(prepReserva.codigo, 200, JSON.stringify(prepReserva.cuerpo));
    const prepQuitar = await llamar({ token: tokenDe(M), body: quitar(WM.favorito) });
    assert.deepEqual([prepQuitar.codigo, prepQuitar.cuerpo.reserva.estado], [200, "quitada"]);
    assert.deepEqual(estadoReservas(M, WM.favorito), [[id, "revoked"]], "precondición: reserva revocada");

    const t1 = await llamar({ token: tokenDe(M) });
    const sid = t1.cuerpo.sesionId;
    const item = itemDe(t1, WM.favorito);
    const crearCliente = (url, key, opts) =>
      createClient(url, key, {
        ...opts,
        global: {
          ...(opts?.global || {}),
          fetch: async (input, init) =>
            String(input).includes("/rest/v1/recommendation_items") && init?.method === "POST"
              ? Promise.reject(new TypeError("fetch failed"))
              : fetch(input, init),
        },
      });
    const r = await llamar({ token: tokenDe(M), body: reservar(sid, item), deps: { crearCliente } });
    assert.equal(r.codigo, 503);
    assert.deepEqual([r.cuerpo.estado, r.cuerpo.codigo, r.cuerpo.reintentable, r.cuerpo.sesionId], ["reserva_guardada_sin_tanda", "persistencia_error", true, sid]);
    assert.deepEqual(r.cuerpo.reserva, { id, wineId: WM.favorito, estado: "reactivada" });
    assert.deepEqual(estadoReservas(M, WM.favorito), [[id, "active"]], "la reserva queda activa tras el fallo de la tanda");
    assert.deepEqual(tandasDe(sid), [1], "la tanda fallida no registró ítems");

    const re = await llamar({ token: tokenDe(M), body: reservar(sid, item) });
    assert.equal(re.codigo, 200, JSON.stringify(re.cuerpo));
    assert.deepEqual([re.cuerpo.reserva.estado, re.cuerpo.tanda], ["ya_estaba_activa", 3]);
    assert.equal(idsDe(re).includes(WM.favorito), false);
    assert.deepEqual(estadoReservas(M, WM.favorito), [[id, "active"]], "el reintento no duplica la reserva");
    assert.deepEqual(tandasDe(sid), [1, 3]);
    assert.equal(sql(`select status from public.recommendation_sessions where id = '${sid}'`), "active");

    const q = await llamar({ token: tokenDe(M), body: quitar(WM.favorito) });
    assert.equal(q.cuerpo.reserva.estado, "quitada");
  } finally {
    liberarReservas(M, [WM.favorito]);
  }
});

test("7.4-B3 rechazos: sesión, ítem o vino ajenos, sesión inactiva, entradas inválidas — sin escrituras", { skip }, async () => {
  const tx = await llamar({ token: tokenDe(X) });
  const tx2 = await llamar({ token: tokenDe(X) });
  const tm = await llamar({ token: tokenDe(M) });
  const itemX = itemDe(tx, WX.favorito);
  const itemM = tm.cuerpo.recomendaciones[0].itemId;
  const cerrada = (await llamar({ token: tokenDe(X) })).cuerpo.sesionId;
  sql(`update public.recommendation_sessions set status = 'completed', ended_at = now() where id = '${cerrada}'`);
  const antes = contarFilas();
  for (const [token, body, codigo, cod] of [
    [tokenDe(Y), reservar(tx.cuerpo.sesionId, itemX), 404, "sesion_no_encontrada"],
    [tokenDe(X), reservar(tx.cuerpo.sesionId, itemM), 404, "item_no_encontrado"],
    [tokenDe(X), reservar(tx2.cuerpo.sesionId, itemX), 404, "item_no_encontrado"],
    [tokenDe(X), reservar(cerrada, itemX), 409, "sesion_inactiva"],
    [tokenDe(X), reservar(tx.cuerpo.sesionId, "no-es-uuid"), 400, "item_invalido"],
    [tokenDe(X), quitar(WY), 404, "vino_no_encontrado"],
    [tokenDe(X), quitar(WM.favorito), 404, "vino_no_encontrado"],
    [tokenDe(X), { accion: "borrar", wineId: WX.favorito }, 400, "accion_invalida"],
    [tokenDe(V), reservar(tx.cuerpo.sesionId, itemX), 403, "sin_cava"],
  ]) {
    const r = await llamar({ token, body });
    assert.equal(r.codigo, codigo, cod);
    assert.equal(r.cuerpo.codigo, cod);
  }
  assert.equal(contarFilas(), antes);
});

// Último: ni 7.3-A ni 7.4-B1/B2/B3 modificaron vinos, stock, consumos,
// preferencias, conocimiento previo ni eventos. Lo único nuevo en
// user_knowledge son las reservas explícitas de 7.4-B3 (todas quitadas al
// final de sus pruebas).
test("integridad: solo se escribieron reservas explícitas; ni inferencias, ni eventos, ni datos de la biblioteca", { skip }, async () => {
  assert.equal(huellaIntegridad(), estadoInicial);
  assert.equal(Number(sql("select count(*) from public.user_knowledge where not coalesce(value ->> 'marca' = 'reserva', false)")), 7);
  const reservas = JSON.parse(sql(`select coalesce(json_agg(json_build_array(user_id, wine_id, knowledge_type, scope_type, source_type, status, value) order by user_id, wine_id), '[]') from public.user_knowledge where value ->> 'marca' = 'reserva'`));
  assert.deepEqual(reservas.map((r) => [r[0], r[1]]), [[X, WX.stockSinTomar], [O, WO], [M, WM.favorito]].sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)));
  for (const r of reservas) {
    assert.deepEqual(r.slice(2), ["explicit", "wine", "recommender", "revoked", { marca: "reserva", motivo: "ocasion_especial", version: 1 }]);
  }
  assert.equal(Number(sql("select count(*) from public.recommendation_events")), 0);
  assert.equal(Number(sql("select count(*) from public.user_knowledge where knowledge_type = 'inference'")), 1);
});

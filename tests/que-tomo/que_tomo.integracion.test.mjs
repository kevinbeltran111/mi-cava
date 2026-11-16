// =============================================================================
// Integración 7.3-A: POST /api/que-tomo con supabase-js, PostgREST y
// PostgreSQL LOCALES (RLS real) y datos sintéticos (tests/que-tomo/seed.sql).
// Lo lanza supabase/tests/run_que_tomo_integracion.sh. Sin IT_REST_URL /
// IT_JWT_SECRET / IT_DB se omite.
//
// El motor de 7.3-B NO existe: donde hace falta se inyecta un motor
// SINTÉTICO de prueba, solo para verificar validación y persistencia.
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
// Huella de todo lo que 7.3-A no debe modificar.
const huellaIntegridad = () => sql(`
  select md5(string_agg(t, '|' order by t)) from (
    select 'w:' || md5(string_agg(to_jsonb(w)::text, ',' order by id)) as t from public.wines w
    union all select 'p:' || md5(string_agg(to_jsonb(p)::text, ',' order by wine_id)) from public.wine_privado p
    union all select 'c:' || md5(string_agg(to_jsonb(c)::text, ',' order by id)) from public.consumos c
    union all select 'k:' || md5(string_agg(to_jsonb(k)::text, ',' order by id)) from public.user_knowledge k
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

async function llamar({ token, body = { consulta: "¿Qué tomo con un asado?" }, deps } = {}) {
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
      modo: "food",
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
// Estado de 7.3-A: sin motor
// ---------------------------------------------------------------------------
test("sin motor (7.3-A): 501 motor_pendiente, sin sesión ni recomendaciones simuladas", { skip }, async () => {
  const r = await llamar({ token: tokenDe(X) });
  assert.equal(r.codigo, 501);
  assert.equal(r.cuerpo.codigo, "motor_pendiente");
  assert.equal(r.cuerpo.recomendaciones, undefined);
  assert.equal(sesionesDe(X), 0);
});

test("biblioteca vacía: sin_candidatos, no llama al motor ni crea sesión", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([]);
  const r = await llamar({ token: tokenDe(E), deps: { motor } });
  assert.equal(r.codigo, 200);
  assert.equal(r.cuerpo.estado, "sin_candidatos");
  assert.deepEqual(r.cuerpo.recomendaciones, []);
  assert.equal(llamadas.length, 0);
  assert.equal(sesionesDe(E), 0);
});

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
  const { motor, llamadas } = motorSintetico([]);
  const r = await llamar({ token: tokenDe(X), body: { consulta: "algo", userId: Y, user_id: Y }, deps: { motor } });
  assert.equal(r.codigo, 200);
  assert.equal(llamadas[0].contexto.usuarioId, X);
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
test("persistencia: sesión e items reales, identidad desde la base, disponible vs consumido", { skip }, async () => {
  const { motor, llamadas } = motorSintetico([WX.stockSinTomar, WX.tomadoMal]);
  const r = await llamar({ token: tokenDe(X), body: { consulta: "  ¿Qué tomo con pescado?  " }, deps: { motor } });
  assert.equal(r.codigo, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.estado, "ok");
  assert.equal(llamadas[0].consulta, "¿Qué tomo con pescado?");
  assert.equal(llamadas[0].candidatos.length, 4);

  const [a, b] = r.cuerpo.recomendaciones;
  assert.deepEqual([a.posicion, a.wineId, a.vino.nombre, a.disponible, a.stock, a.consumidoAntes, a.favorito],
    [1, WX.stockSinTomar, "X Stock sin tomar", true, 6, false, false]);
  assert.deepEqual([b.posicion, b.wineId, b.disponible, b.consumidoAntes, b.vecesConsumido],
    [2, WX.tomadoMal, false, true, 2]);

  const s = JSON.parse(sql(`select to_jsonb(s) from public.recommendation_sessions s where id = '${r.cuerpo.sesionId}'`));
  assert.equal(s.user_id, X);
  assert.equal(s.mode, "food");
  assert.equal(s.status, "active");
  assert.equal(s.initial_input, "¿Qué tomo con pescado?");
  assert.deepEqual(s.context, { prueba: true });
  assert.equal(s.engine_version, "prueba-7.3-A");

  const items = JSON.parse(sql(`select json_agg(to_jsonb(i) order by position) from public.recommendation_items i where session_id = '${r.cuerpo.sesionId}'`));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => [i.position, i.batch_no, i.relationship, i.wine_id]),
    [[1, 1, "owned", WX.stockSinTomar], [2, 1, "owned", WX.tomadoMal]]);
  assert.deepEqual(items[1].wine_identity, { nombre: "X Tomado mal", bodega: "Bodega Tres", varietal: "Torrontés", anada: null, lugar: "Cafayate", region: "Salta" });

  // X lo lee por RLS; Y no.
  const propios = await clienteUsuario(X).from("recommendation_items").select("id").eq("session_id", r.cuerpo.sesionId);
  assert.equal(propios.data.length, 2);
  const ajenos = await clienteUsuario(Y).from("recommendation_sessions").select("id").eq("id", r.cuerpo.sesionId);
  assert.equal(ajenos.data.length, 0);
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
  const r = await llamar({ token: tokenDe(X), body: { consulta: "prueba falla items" }, deps: { motor, crearCliente } });
  assert.equal(r.codigo, 503);
  assert.equal(r.cuerpo.codigo, "persistencia_error");
  const fila = sql(`select status || '|' || (ended_at is not null) from public.recommendation_sessions where initial_input = 'prueba falla items'`);
  assert.equal(fila, "error|true");
});

test("candidatos desde la base: toda la biblioteca, sin filtrar por stock", { skip }, async () => {
  const { contexto } = await construirContexto(clienteUsuario(X), X);
  const { candidatos, resumen } = recuperarCandidatos(contexto);
  assert.deepEqual(resumen, { total: 4, disponibles: 2, consumidosAntes: 3, favoritos: 1 });
  assert.equal(validarSalidaMotor({ modo: "cellar", recomendaciones: [{ wineId: WX.tomadoSinPuntuar, relationship: "known", explicacion: "x" }] }, candidatos).ok, true);
});

// Último: 7.3-A no modificó vinos, stock, consumos, preferencias, conocimiento ni eventos.
test("integridad: no se escribió user_knowledge, eventos ni datos de la biblioteca", { skip }, async () => {
  assert.equal(huellaIntegridad(), estadoInicial);
  assert.equal(Number(sql("select count(*) from public.user_knowledge")), 5);
});

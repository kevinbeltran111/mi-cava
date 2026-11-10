// =============================================================================
// Integración 7.2-A: src/onboarding/preferencias.js con supabase-js (el mismo
// de la app), PostgREST y PostgreSQL LOCALES, con RLS real.
// Lo lanza supabase/tests/run_preferencias_integracion.sh, que prepara la
// base y define IT_REST_URL e IT_JWT_SECRET. Sin esas variables se omite.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  leerPreferencias, iniciarOnboarding, guardarProgreso, completarOnboarding,
  omitirOnboarding, editarPreferencias, debeMostrarOnboarding, pasoParaReanudar,
  CARGA, ESTADOS, PASOS, RESPUESTA_TIPOS,
} from "../../src/onboarding/preferencias.js";

const REST = process.env.IT_REST_URL;
const SECRET = process.env.IT_JWT_SECRET;
const skip = !REST || !SECRET ? "sin IT_REST_URL / IT_JWT_SECRET (usar run_preferencias_integracion.sh)" : false;

const X = "00000000-0000-0000-0000-0000000000a1";
const Y = "00000000-0000-0000-0000-0000000000b1";
const L = "00000000-0000-0000-0000-0000000000c1"; // fila de 7.1 sin wine_types_answer

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}
function jwt(payload) {
  const h = b64url({ alg: "HS256", typ: "JWT" });
  const p = b64url({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

// supabase-js habla con <url>/rest/v1; este proxy reenvía a PostgREST.
let server;
let baseUrl;
before(async () => {
  if (skip) return;
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = REST + req.url.replace(/^\/rest\/v1/, "");
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const r = await fetch(url, {
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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const opcionesBase = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
function clienteDe(uid, fetchImpl) {
  const token = uid ? jwt({ role: "authenticated", sub: uid, aud: "authenticated" }) : jwt({ role: "anon" });
  return createClient(baseUrl, token, { ...opcionesBase, global: fetchImpl ? { fetch: fetchImpl } : {} });
}
// Falla de red: fetch que nunca llega al servidor.
const fetchCaido = async () => { throw new TypeError("fetch failed"); };
// Lecturas funcionan, escrituras se cortan en la red.
const fetchSoloLectura = async (input, init = {}) => {
  if ((init.method || "GET").toUpperCase() !== "GET") throw new TypeError("fetch failed");
  return fetch(input, init);
};

async function leer(uid) {
  const l = await leerPreferencias(clienteDe(uid), uid);
  assert.equal(l.carga === CARGA.ERROR, false, JSON.stringify(l.error));
  return l;
}

// Las pruebas comparten la base y corren en orden.

test("1. usuario sin registro previo", { skip }, async () => {
  const l = await leer(X);
  assert.equal(l.carga, CARGA.SIN_REGISTRO);
  assert.equal(l.preferencias, null);
  assert.equal(debeMostrarOnboarding(l), true);
  assert.equal(pasoParaReanudar(l.preferencias), PASOS.BIENVENIDA);
});

test("error de red al leer: ERROR de conexión, nunca SIN_REGISTRO", { skip }, async () => {
  const l = await leerPreferencias(clienteDe(X, fetchCaido), X);
  assert.equal(l.carga, CARGA.ERROR);
  assert.equal(l.error.tipo, "conexion");
  assert.equal(debeMostrarOnboarding(l), false);
});

test("2. creación de preferencias propias al iniciar", { skip }, async () => {
  const r = await iniciarOnboarding(clienteDe(X), X);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.preferencias.estado, ESTADOS.STARTED);
  assert.equal(r.preferencias.paso, PASOS.TIPOS);
  assert.equal(r.preferencias.respuestaTipos, null, "pregunta todavía no respondida");
  const l = await leer(X);
  assert.equal(l.carga, CARGA.CON_REGISTRO);
  assert.equal(debeMostrarOnboarding(l), true);
});

test("3. selección múltiple de tipos y variedades", { skip }, async () => {
  const c = clienteDe(X);
  let r = await guardarProgreso(c, X, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.RESPONDIDA, tipos: ["espumoso", "tinto"] } },
    paso: PASOS.VARIEDADES,
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.preferencias.tipos, ["tinto", "espumoso"]);
  assert.equal(r.preferencias.exploracion, false);
  r = await guardarProgreso(c, X, {
    cambios: { variedades: ["pinot_noir", "chardonnay", "malbec"] },
    paso: PASOS.CONOCIMIENTO,
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.preferencias.variedades, ["pinot_noir", "chardonnay", "malbec"]);
  assert.deepEqual(r.preferencias.tipos, ["tinto", "espumoso"], "los tipos no se tocaron");
});

test("6. guardado y recuperación de progreso (reanudar / Atrás)", { skip }, async () => {
  const l = await leer(X);
  assert.equal(l.preferencias.estado, ESTADOS.STARTED);
  assert.equal(pasoParaReanudar(l.preferencias), PASOS.CONOCIMIENTO);
  assert.equal(l.preferencias.respuestaTipos, RESPUESTA_TIPOS.RESPONDIDA);
  assert.deepEqual(l.preferencias.tipos, ["tinto", "espumoso"]);
  assert.deepEqual(l.preferencias.variedades, ["pinot_noir", "chardonnay", "malbec"]);
  // Atrás: vuelve a tipos sin enviar respuestas → todo se conserva
  const r = await guardarProgreso(clienteDe(X), X, { paso: PASOS.TIPOS });
  assert.equal(r.ok, true);
  assert.equal(r.preferencias.paso, PASOS.TIPOS);
  assert.deepEqual(r.preferencias.variedades, ["pinot_noir", "chardonnay", "malbec"]);
  // «Empezar» otra vez sobre started: no reinicia nada
  const i = await iniciarOnboarding(clienteDe(X), X);
  assert.equal(i.ok, true);
  assert.equal(i.sinCambios, true);
  assert.equal(i.yaResuelto, false);
  assert.equal(i.preferencias.paso, PASOS.TIPOS);
});

test("4. omitir la pregunta ≠ «No tengo preferencia todavía»", { skip }, async () => {
  const rx = await guardarProgreso(clienteDe(X), X, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.SIN_PREFERENCIA } }, paso: PASOS.VARIEDADES,
  });
  assert.equal(rx.ok, true, JSON.stringify(rx.error));
  assert.equal(await iniciarOnboarding(clienteDe(Y), Y).then((r) => r.ok), true);
  const ry = await guardarProgreso(clienteDe(Y), Y, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.OMITIDA } }, paso: PASOS.VARIEDADES,
  });
  assert.equal(ry.ok, true, JSON.stringify(ry.error));
  const px = (await leer(X)).preferencias;
  const py = (await leer(Y)).preferencias;
  assert.equal(px.respuestaTipos, "no_preference");
  assert.equal(py.respuestaTipos, "skipped");
  assert.deepEqual([px.tipos, px.exploracion], [[], false]);
  assert.deepEqual([py.tipos, py.exploracion], [[], false]);
  // la base rechaza la contradicción aunque se saltee la capa
  const { error } = await clienteDe(X).from("user_preferences")
    .update({ preferred_wine_types: ["tinto"] }).eq("user_id", X).select();
  assert.equal(error?.code, "23514");
});

test("5. «Me gusta probar de todo» (no es ausencia de preferencia)", { skip }, async () => {
  const r = await guardarProgreso(clienteDe(X), X, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.RESPONDIDA, exploracion: true } }, paso: PASOS.VARIEDADES,
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.preferencias.respuestaTipos, "answered");
  assert.equal(r.preferencias.exploracion, true);
  assert.deepEqual(r.preferencias.tipos, []);
  const v = await guardarProgreso(clienteDe(X), X, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.SIN_PREFERENCIA, exploracion: true } },
  });
  assert.equal(v.ok, false);
  assert.equal(v.error.tipo, "validacion");
});

test("8. escrituras parciales sin pérdida de otros campos", { skip }, async () => {
  const antes = (await leer(X)).preferencias;
  const r = await guardarProgreso(clienteDe(X), X, { cambios: { nivel: "beginner" }, paso: PASOS.CIERRE });
  assert.equal(r.ok, true);
  assert.equal(r.preferencias.nivel, "beginner");
  for (const k of ["respuestaTipos", "tipos", "exploracion", "variedades", "estado"]) {
    assert.deepEqual(r.preferencias[k], antes[k], k);
  }
});

test("escritura fallida por red: no se confirma nada y la base no cambia", { skip }, async () => {
  const antes = (await leer(X)).preferencias;
  const r = await guardarProgreso(clienteDe(X, fetchSoloLectura), X, { cambios: { nivel: "advanced" } });
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "conexion");
  assert.equal(r.preferencias, undefined);
  const c = await completarOnboarding(clienteDe(X, fetchCaido), X);
  assert.equal(c.ok, false);
  const despues = (await leer(X)).preferencias;
  assert.equal(despues.nivel, antes.nivel);
  assert.equal(despues.estado, ESTADOS.STARTED);
});

test("7a. completar y editar sin alterar completed", { skip }, async () => {
  const c = await completarOnboarding(clienteDe(X), X, { cambios: { nivel: "intermediate" } });
  assert.equal(c.ok, true, JSON.stringify(c.error));
  assert.equal(c.preferencias.estado, ESTADOS.COMPLETED);
  assert.equal(c.preferencias.paso, PASOS.CIERRE);
  assert.ok(c.preferencias.resueltoEn);
  assert.equal(c.preferencias.resueltoEn, c.preferencias.actualizadoEn,
    "resolved_at = hora de la transacción en la base (igual a updated_at del trigger de 7.1)");
  assert.equal(c.preferencias.nivel, "intermediate");
  const resuelto = c.preferencias.resueltoEn;

  const e = await editarPreferencias(clienteDe(X), X, {
    tipos: { respuesta: RESPUESTA_TIPOS.RESPONDIDA, tipos: ["naranjo"] }, variedades: ["torrontes"],
  });
  assert.equal(e.ok, true, JSON.stringify(e.error));
  assert.equal(e.preferencias.estado, ESTADOS.COMPLETED);
  assert.equal(e.preferencias.resueltoEn, resuelto);
  assert.equal(e.preferencias.paso, PASOS.CIERRE);
  assert.deepEqual(e.preferencias.tipos, ["naranjo"]);
  assert.equal(debeMostrarOnboarding(await leer(X)), false);

  // doble clic en «Ir a Mi Cava»: idempotente, sin tocar la fecha
  const d = await completarOnboarding(clienteDe(X), X);
  assert.equal(d.ok, true);
  assert.equal(d.yaResuelto, true);
  assert.equal(d.preferencias.resueltoEn, resuelto);
  // completar con cambios sobre algo ya resuelto: no se confirma
  const dc = await completarOnboarding(clienteDe(X), X, { cambios: { nivel: "advanced" } });
  assert.equal(dc.ok, false);
  assert.equal(dc.error.tipo, "estado");
  // guardar progreso de onboarding sobre completed: no se aplica
  const g = await guardarProgreso(clienteDe(X), X, { cambios: { nivel: "advanced" }, paso: 1 });
  assert.equal(g.ok, false);
  assert.equal(g.error.tipo, "estado");
  const fin = (await leer(X)).preferencias;
  assert.equal(fin.nivel, "intermediate");
  assert.equal(fin.estado, ESTADOS.COMPLETED);
  // «Empezar» sobre completed: no reabre
  const i = await iniciarOnboarding(clienteDe(X), X);
  assert.equal(i.ok, true);
  assert.equal(i.yaResuelto, true);
  assert.equal(i.preferencias.estado, ESTADOS.COMPLETED);
});

test("7b. omitir conserva respuestas parciales; editar no altera skipped", { skip }, async () => {
  const o = await omitirOnboarding(clienteDe(Y), Y);
  assert.equal(o.ok, true, JSON.stringify(o.error));
  assert.equal(o.preferencias.estado, ESTADOS.SKIPPED);
  assert.equal(o.preferencias.respuestaTipos, "skipped", "respuesta previa conservada");
  assert.equal(o.preferencias.paso, PASOS.VARIEDADES, "paso conservado");
  assert.equal(o.preferencias.resueltoEn, o.preferencias.actualizadoEn, "fecha fijada por la base");
  const resuelto = o.preferencias.resueltoEn;
  const e = await editarPreferencias(clienteDe(Y), Y, { nivel: "advanced" });
  assert.equal(e.ok, true);
  assert.equal(e.preferencias.estado, ESTADOS.SKIPPED);
  assert.equal(e.preferencias.resueltoEn, resuelto);
  const o2 = await omitirOnboarding(clienteDe(Y), Y);
  assert.equal(o2.ok, true);
  assert.equal(o2.yaResuelto, true);
  assert.equal(o2.preferencias.resueltoEn, resuelto);
  const c = await completarOnboarding(clienteDe(Y), Y);
  assert.equal(c.ok, true);
  assert.equal(c.yaResuelto, true);
  assert.equal(c.preferencias.estado, ESTADOS.SKIPPED, "completar no pisa un skipped");
});

test("«Ahora no» desde la bienvenida, sin registro previo", { skip }, async () => {
  const W = "00000000-0000-0000-0000-0000000000e1"; // tiene perfil, no tiene fila
  assert.equal((await leer(W)).carga, CARGA.SIN_REGISTRO);
  const r = await omitirOnboarding(clienteDe(W), W);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.preferencias.estado, ESTADOS.SKIPPED);
  assert.ok(r.preferencias.resueltoEn);
  assert.equal(r.preferencias.resueltoEn, r.preferencias.actualizadoEn, "fecha fijada por la base");
  assert.equal(r.preferencias.respuestaTipos, null);
  assert.equal(debeMostrarOnboarding(await leer(W)), false);
});

test("usuario sin perfil: la FK impide crear la fila → error, no éxito falso", { skip }, async () => {
  const Z = "00000000-0000-0000-0000-0000000000d1";
  const r = await omitirOnboarding(clienteDe(Z), Z);
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "restriccion");
});

test("9. permisos y aislamiento por usuario (RLS)", { skip }, async () => {
  // X no ve la fila de Y
  const l = await leerPreferencias(clienteDe(X), Y);
  assert.equal(l.carga, CARGA.SIN_REGISTRO);
  const antes = (await leer(Y)).preferencias;
  // X no puede crear ni editar la fila de Y
  const e = await editarPreferencias(clienteDe(X), Y, { nivel: "beginner" });
  assert.equal(e.ok, false);
  assert.ok(["permiso", "estado"].includes(e.error.tipo), e.error.tipo);
  const o = await omitirOnboarding(clienteDe(X), Y);
  assert.equal(o.ok, false);
  assert.deepEqual((await leer(Y)).preferencias, antes, "Y intacto");
  // anon: error de permiso, no «sin registro»
  const a = await leerPreferencias(clienteDe(null), X);
  assert.equal(a.carga, CARGA.ERROR);
  assert.equal(a.error.tipo, "permiso");
  // sin DELETE
  const { error } = await clienteDe(X).from("user_preferences").delete().eq("user_id", X);
  assert.equal(error?.code, "42501");
  assert.equal((await leer(X)).carga, CARGA.CON_REGISTRO);
});

test("10. compatibilidad con una fila de 7.1 sin respuesta de tipos", { skip }, async () => {
  const l = await leer(L);
  assert.equal(l.carga, CARGA.CON_REGISTRO);
  assert.equal(l.preferencias.respuestaTipos, null);
  assert.deepEqual(l.preferencias.tipos, ["tinto", "rosado"]);
  assert.equal(l.preferencias.nivel, "intermediate");
  assert.equal(pasoParaReanudar(l.preferencias), PASOS.VARIEDADES);
  // seguir el onboarding sobre esa fila funciona y no pierde datos
  const r = await guardarProgreso(clienteDe(L), L, { cambios: { variedades: ["malbec"] }, paso: PASOS.CONOCIMIENTO });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.preferencias.tipos, ["tinto", "rosado"]);
  assert.equal(r.preferencias.respuestaTipos, null);
  const t = await guardarProgreso(clienteDe(L), L, {
    cambios: { tipos: { respuesta: RESPUESTA_TIPOS.RESPONDIDA, tipos: ["tinto", "rosado"] } },
  });
  assert.equal(t.ok, true);
  assert.equal(t.preferencias.respuestaTipos, "answered");
});

test("variedad fuera del catálogo: rechazada antes de escribir", { skip }, async () => {
  const r = await editarPreferencias(clienteDe(X), X, { variedades: ["Blend"] });
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "validacion");
  assert.deepEqual((await leer(X)).preferencias.variedades, ["torrontes"]);
});

// -----------------------------------------------------------------------------
// Fecha de cierre determinada por la base aunque el reloj del dispositivo
// esté desfasado (el cliente nunca envía una fecha propia).
// -----------------------------------------------------------------------------
test("reloj del dispositivo desfasado: la fecha de cierre la fija la base", { skip }, async () => {
  const V = "00000000-0000-0000-0000-0000000000f1"; // tiene perfil, sin fila
  const cuerpos = [];
  const espia = async (input, init = {}) => {
    if (init.body) cuerpos.push(String(init.body));
    return fetch(input, init);
  };
  const cliente = clienteDe(V, espia); // token firmado con la hora real
  const RealDate = globalThis.Date;
  const desfase = -5 * 365 * 24 * 3600 * 1000; // dispositivo 5 años atrás
  class DateFalso extends RealDate {
    constructor(...a) { super(...(a.length ? a : [RealDate.now() + desfase])); }
    static now() { return RealDate.now() + desfase; }
  }
  globalThis.Date = DateFalso;
  let r;
  try {
    r = await completarOnboarding(cliente, V);
  } finally {
    globalThis.Date = RealDate;
  }
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(cuerpos.some((b) => b.includes('"onboarding_resolved_at":"now"')), "se envió 'now'");
  const anio = new RealDate(r.preferencias.resueltoEn).getUTCFullYear();
  assert.ok(Math.abs(new RealDate(r.preferencias.resueltoEn) - RealDate.now()) < 60_000,
    `la fecha guardada es la del servidor (año ${anio}), no la del dispositivo`);
  assert.equal(r.preferencias.resueltoEn, r.preferencias.actualizadoEn);
});

// -----------------------------------------------------------------------------
// Punto 2: registro vacío en never — sin ofrecimientos repetidos tras resolver
// -----------------------------------------------------------------------------
test("registro never creado por una escritura interrumpida equivale a sin registro", { skip }, async () => {
  const N = "00000000-0000-0000-0000-0000000000f2"; // tiene perfil, sin fila
  // El alta (POST) llega; el UPDATE (PATCH) se corta en la red.
  const cortaPatch = async (input, init = {}) => {
    if ((init.method || "GET").toUpperCase() === "PATCH") throw new TypeError("fetch failed");
    return fetch(input, init);
  };
  const r = await omitirOnboarding(clienteDe(N, cortaPatch), N);
  assert.equal(r.ok, false, "no se confirma el «Ahora no» fallido");
  const l = await leer(N);
  assert.equal(l.carga, CARGA.CON_REGISTRO);
  assert.equal(l.preferencias.estado, ESTADOS.NEVER);
  assert.equal(l.preferencias.resueltoEn, null);
  assert.equal(debeMostrarOnboarding(l), true, "se vuelve a ofrecer: el usuario no lo resolvió");
  assert.equal(pasoParaReanudar(l.preferencias), PASOS.BIENVENIDA);
  // Al reintentar, se resuelve sobre la misma fila (no se duplica nada)
  const r2 = await omitirOnboarding(clienteDe(N), N);
  assert.equal(r2.ok, true);
  assert.equal(r2.sinCambios, undefined);
  assert.equal(r2.preferencias.estado, ESTADOS.SKIPPED);
  const fecha = r2.preferencias.resueltoEn;
  // Ya resuelto: ninguna operación posterior lo vuelve a ofrecer ni cambia la fecha
  for (const op of [
    () => omitirOnboarding(clienteDe(N), N),
    () => completarOnboarding(clienteDe(N), N),
    () => iniciarOnboarding(clienteDe(N), N),
    () => editarPreferencias(clienteDe(N), N, { variedades: ["malbec"] }),
  ]) {
    const x = await op();
    assert.equal(x.ok, true, JSON.stringify(x.error));
    const ll = await leer(N);
    assert.equal(ll.preferencias.estado, ESTADOS.SKIPPED);
    assert.equal(ll.preferencias.resueltoEn, fecha);
    assert.equal(debeMostrarOnboarding(ll), false);
  }
  const { count } = await clienteDe(N).from("user_preferences").select("*", { count: "exact", head: true });
  assert.equal(count, 1, "una sola fila por usuario");
});

test("edición antes del onboarding: crea never, conserva las respuestas y no lo resuelve", { skip }, async () => {
  const P = "00000000-0000-0000-0000-0000000000f3"; // tiene perfil, sin fila
  const e = await editarPreferencias(clienteDe(P), P, { variedades: ["syrah"] });
  assert.equal(e.ok, true, JSON.stringify(e.error));
  assert.equal(e.preferencias.estado, ESTADOS.NEVER);
  assert.equal(debeMostrarOnboarding(await leer(P)), true);
  const i = await iniciarOnboarding(clienteDe(P), P);
  assert.equal(i.ok, true);
  assert.equal(i.preferencias.estado, ESTADOS.STARTED);
  assert.deepEqual(i.preferencias.variedades, ["syrah"], "la respuesta editada se conserva");
  const c = await completarOnboarding(clienteDe(P), P);
  assert.equal(c.ok, true);
  assert.equal(debeMostrarOnboarding(await leer(P)), false);
});

test("usuario invitado (perfil viewer creado por el servidor) gestiona su propia fila", { skip }, async () => {
  const I = "00000000-0000-0000-0000-0000000000f4"; // perfil role = viewer, sin fila
  assert.equal((await leer(I)).carga, CARGA.SIN_REGISTRO);
  const o = await omitirOnboarding(clienteDe(I), I);
  assert.equal(o.ok, true, JSON.stringify(o.error));
  assert.equal(debeMostrarOnboarding(await leer(I)), false);
});

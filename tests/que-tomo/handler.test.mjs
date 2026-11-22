// 7.3-A: validaciones del endpoint que no necesitan base (cliente falso).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearHandler, MAX_CONSULTA } from "../../api/que-tomo.js";

const ENTORNO = { VITE_SUPABASE_URL: "http://falso.local", VITE_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "srv" };

function resFalsa() {
  return { codigo: null, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
}

// Cliente que registra qué se pidió. getUser acepta solo "token-bueno".
function clienteFalso(registro) {
  return () => ({
    auth: {
      async getUser(t) {
        registro.push(["getUser", t]);
        return t === "token-bueno" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "invalid" } };
      },
    },
    from(tabla) { registro.push(["from", tabla]); throw new Error("no debería consultar datos"); },
  });
}

async function llamar(req, deps = {}) {
  const registro = [];
  const res = resFalsa();
  await crearHandler({ entorno: ENTORNO, crearCliente: clienteFalso(registro), ...deps })(req, res);
  return { res, registro };
}

test("405 para métodos distintos de POST", async () => {
  const { res } = await llamar({ method: "GET", headers: {} });
  assert.equal(res.codigo, 405);
});

test("500 si faltan variables (incluida la service_role)", async () => {
  const { res } = await llamar({ method: "POST", headers: {} }, { entorno: { ...ENTORNO, SUPABASE_SERVICE_ROLE_KEY: "" } });
  assert.equal(res.codigo, 500);
});

test("401 sin token y con token inválido, sin consultar datos", async () => {
  let r = await llamar({ method: "POST", headers: {}, body: { consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
  assert.equal(r.registro.some(([k]) => k === "from"), false);
  r = await llamar({ method: "POST", headers: { authorization: "Bearer token-malo" }, body: { consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
  assert.equal(r.registro.some(([k]) => k === "from"), false);
  r = await llamar({ method: "POST", headers: { authorization: "Basic token-bueno" }, body: { consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
});

test("400 con consulta vacía, no textual o demasiado larga", async () => {
  const h = { authorization: "Bearer token-bueno" };
  for (const body of [undefined, {}, { consulta: "   " }, { consulta: 42 }, { consulta: "x".repeat(MAX_CONSULTA + 1) }]) {
    const { res, registro } = await llamar({ method: "POST", headers: h, body });
    assert.equal(res.codigo, 400, JSON.stringify(body)?.slice(0, 40));
    assert.equal(registro.some(([k]) => k === "from"), false);
  }
});

// 7.3-A / 7.4-B1: validaciones del endpoint que no necesitan base (cliente falso).
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
  let r = await llamar({ method: "POST", headers: {}, body: { modo: "cellar", consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
  assert.equal(r.registro.some(([k]) => k === "from"), false);
  r = await llamar({ method: "POST", headers: { authorization: "Bearer token-malo" }, body: { modo: "cellar", consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
  assert.equal(r.registro.some(([k]) => k === "from"), false);
  r = await llamar({ method: "POST", headers: { authorization: "Basic token-bueno" }, body: { modo: "cellar", consulta: "hola" } });
  assert.equal(r.res.codigo, 401);
});

// 7.4-B1: la consulta ya no es obligatoria; el modo sí. Sin modo o con un
// modo desconocido → 400; food / discovery → 501 (7.5). En todos los casos,
// antes de leer datos.
test("400 sin modo válido o con consulta no textual o demasiado larga; 501 para food / discovery", async () => {
  const h = { authorization: "Bearer token-bueno" };
  for (const [body, codigo] of [
    [undefined, 400], [{}, 400], [{ consulta: "hola" }, 400], [{ modo: "otro" }, 400],
    [{ modo: "cellar", consulta: 42 }, 400], [{ modo: "cellar", consulta: "x".repeat(MAX_CONSULTA + 1) }, 400],
    [{ modo: "food", consulta: "asado" }, 501], [{ modo: "discovery" }, 501],
  ]) {
    const { res, registro } = await llamar({ method: "POST", headers: h, body });
    assert.equal(res.codigo, codigo, JSON.stringify(body)?.slice(0, 40));
    assert.equal(registro.some(([k]) => k === "from"), false);
  }
});

test("cellar sin consulta o con consulta en blanco pasa la validación de entrada (llega a leer el rol)", async () => {
  const h = { authorization: "Bearer token-bueno" };
  for (const body of [{ modo: "cellar" }, { modo: "cellar", consulta: "   " }, { modo: "cellar", consulta: null }]) {
    const { registro } = await llamar({ method: "POST", headers: h, body });
    assert.deepEqual(registro.find(([k]) => k === "from"), ["from", "profiles"], JSON.stringify(body));
  }
});

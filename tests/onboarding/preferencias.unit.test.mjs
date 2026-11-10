// Pruebas unitarias de la capa de persistencia (sin red ni base).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cambiosAColumnas, clasificarError, debeMostrarOnboarding, pasoParaReanudar,
  CARGA, ESTADOS, PASOS, RESPUESTA_TIPOS, guardarProgreso, editarPreferencias, leerPreferencias,
} from "../../src/onboarding/preferencias.js";

test("cambiosAColumnas: solo convierte las claves presentes", () => {
  assert.deepEqual(cambiosAColumnas({ nivel: "advanced" }), { ok: true, columnas: { knowledge_level: "advanced" } });
  assert.deepEqual(cambiosAColumnas({ variedades: ["malbec"] }), { ok: true, columnas: { preferred_grapes: ["malbec"] } });
  assert.deepEqual(cambiosAColumnas({}), { ok: true, columnas: {} });
});

test("cambiosAColumnas: pregunta de tipos escribe sus tres columnas juntas", () => {
  assert.deepEqual(cambiosAColumnas({ tipos: { respuesta: "answered", tipos: ["espumoso", "tinto"] } }).columnas,
    { wine_types_answer: "answered", preferred_wine_types: ["tinto", "espumoso"], exploration_open: false });
  assert.deepEqual(cambiosAColumnas({ tipos: { respuesta: "answered", exploracion: true } }).columnas,
    { wine_types_answer: "answered", preferred_wine_types: [], exploration_open: true });
  assert.deepEqual(cambiosAColumnas({ tipos: { respuesta: "no_preference" } }).columnas,
    { wine_types_answer: "no_preference", preferred_wine_types: [], exploration_open: false });
  assert.deepEqual(cambiosAColumnas({ tipos: { respuesta: "skipped" } }).columnas,
    { wine_types_answer: "skipped", preferred_wine_types: [], exploration_open: false });
});

test("cambiosAColumnas: rechaza combinaciones contradictorias en vez de corregirlas", () => {
  const casos = [
    { tipos: { respuesta: "answered" } },
    { tipos: { respuesta: "answered", tipos: [] , exploracion: false } },
    { tipos: { respuesta: "no_preference", tipos: ["tinto"] } },
    { tipos: { respuesta: "no_preference", exploracion: true } },
    { tipos: { respuesta: "skipped", tipos: ["blanco"] } },
    { tipos: { respuesta: null } },
    { tipos: { respuesta: "answered", tipos: ["dulce"] } },
    { tipos: { respuesta: "answered", exploracion: "si" } },
    { variedades: ["Malbec"] },
    { variedades: "malbec" },
    { nivel: "experto" },
    { estado: "completed" },
    { onboarding_status: "completed" },
    null,
  ];
  for (const c of casos) {
    const r = cambiosAColumnas(c);
    assert.equal(r.ok, false, JSON.stringify(c));
    assert.equal(r.error.tipo, "validacion");
  }
});

test("cambiosAColumnas: nivel null = pregunta sin responder", () => {
  assert.deepEqual(cambiosAColumnas({ nivel: null }).columnas, { knowledge_level: null });
});

test("clasificarError: red ≠ ausencia; códigos de PostgreSQL clasificados", () => {
  assert.equal(clasificarError({ message: "TypeError: fetch failed", code: "" }).error.tipo, "conexion");
  assert.equal(clasificarError(new TypeError("Failed to fetch")).error.tipo, "conexion");
  assert.equal(clasificarError({ code: "42501" }).error.tipo, "permiso");
  assert.equal(clasificarError({ code: "23514" }).error.tipo, "restriccion");
  assert.equal(clasificarError({ code: "PGRST204" }).error.tipo, "servidor");
});

test("debeMostrarOnboarding: pendiente / sin registro / error / estados", () => {
  assert.equal(debeMostrarOnboarding({ carga: CARGA.PENDIENTE }), null);
  assert.equal(debeMostrarOnboarding(undefined), null);
  assert.equal(debeMostrarOnboarding({ carga: CARGA.ERROR }), false);
  assert.equal(debeMostrarOnboarding({ carga: CARGA.SIN_REGISTRO }), true);
  for (const [estado, esperado] of [["never", true], ["started", true], ["completed", false], ["skipped", false]]) {
    assert.equal(debeMostrarOnboarding({ carga: CARGA.CON_REGISTRO, preferencias: { estado } }), esperado, estado);
  }
});

test("pasoParaReanudar", () => {
  assert.equal(pasoParaReanudar(null), PASOS.BIENVENIDA);
  assert.equal(pasoParaReanudar({ estado: ESTADOS.NEVER, paso: null }), PASOS.BIENVENIDA);
  assert.equal(pasoParaReanudar({ estado: ESTADOS.STARTED, paso: 3 }), 3);
  assert.equal(pasoParaReanudar({ estado: ESTADOS.STARTED, paso: null }), PASOS.TIPOS);
  assert.equal(pasoParaReanudar({ estado: ESTADOS.STARTED, paso: 99 }), PASOS.TIPOS);
});

test("validación local: no hay llamada a la red si los datos son inválidos o falta el usuario", async () => {
  let llamadas = 0;
  const client = { from() { llamadas++; throw new Error("no debería llamarse"); } };
  assert.equal((await guardarProgreso(client, "u", { cambios: { variedades: ["texto libre"] } })).ok, false);
  assert.equal((await guardarProgreso(client, "u", { paso: 9 })).ok, false);
  assert.equal((await editarPreferencias(client, "u", {})).ok, false);
  assert.equal((await editarPreferencias(client, "", { nivel: "beginner" })).ok, false);
  assert.equal((await leerPreferencias(client, null)).carga, CARGA.ERROR);
  assert.equal(llamadas, 0);
  assert.ok(RESPUESTA_TIPOS.SIN_PREFERENCIA !== RESPUESTA_TIPOS.OMITIDA);
});

// Cliente falso que registra lo que se enviaría a PostgREST.
function clienteEspia() {
  const enviados = [];
  const filaBase = {
    user_id: "u", onboarding_status: "never", onboarding_step: null, onboarding_resolved_at: null,
    wine_types_answer: null, preferred_wine_types: [], exploration_open: false,
    preferred_grapes: [], knowledge_level: null, updated_at: "2026-11-10T00:00:00Z",
  };
  const builder = (op, payload) => {
    const q = {
      eq() { return q; }, in() { return q; },
      select() {
        return Promise.resolve({ data: [{ ...filaBase, ...payload, onboarding_resolved_at: "2026-11-10T00:00:00Z" }], error: null });
      },
      then(res) { return Promise.resolve({ error: null }).then(res); },
    };
    enviados.push({ op, payload });
    return q;
  };
  return {
    enviados,
    client: { from: () => ({ upsert: (p) => builder("upsert", p), update: (p) => builder("update", p) }) },
  };
}

test("completar y omitir no envían la hora del dispositivo: envían 'now' (hora de la base)", async () => {
  for (const op of ["completar", "omitir"]) {
    const { client, enviados } = clienteEspia();
    const { completarOnboarding, omitirOnboarding, FECHA_DEL_SERVIDOR } = await import("../../src/onboarding/preferencias.js");
    const r = op === "completar" ? await completarOnboarding(client, "u") : await omitirOnboarding(client, "u");
    assert.equal(r.ok, true);
    const upd = enviados.find((e) => e.op === "update");
    assert.equal(FECHA_DEL_SERVIDOR, "now");
    assert.equal(upd.payload.onboarding_resolved_at, "now", op);
    assert.equal(JSON.stringify(enviados).match(/\d{4}-\d{2}-\d{2}T/), null, "sin fechas ISO del cliente");
  }
});

test("editar y guardar progreso nunca envían estado ni fecha de cierre", async () => {
  const { guardarProgreso: gp, editarPreferencias: ep } = await import("../../src/onboarding/preferencias.js");
  for (const fn of [(c) => gp(c, "u", { cambios: { nivel: "beginner" }, paso: 3 }), (c) => ep(c, "u", { nivel: "beginner" })]) {
    const { client, enviados } = clienteEspia();
    assert.equal((await fn(client)).ok, true);
    const upd = enviados.find((e) => e.op === "update");
    assert.equal("onboarding_resolved_at" in upd.payload, false);
  }
  const { client, enviados } = clienteEspia();
  await ep(client, "u", { nivel: "beginner" });
  assert.equal("onboarding_status" in enviados.find((e) => e.op === "update").payload, false);
});

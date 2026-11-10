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

// =============================================================================
// E2E 7.2-B: la app real (build de Vite) en Chrome, contra PostgreSQL +
// PostgREST LOCALES con RLS real (vía gateway.mjs). Lo lanza
// supabase/tests/run_onboarding_e2e.sh. Nunca apuntar a Supabase real.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { organizarVariedades, VARIEDADES } from "../../../src/onboarding/catalogo.js";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const APP = process.env.APP_URL;
const GW = process.env.GW_URL;
const REST = process.env.PGRST_URL;
const SECRET = process.env.IT_JWT_SECRET;
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const SHOTS = process.env.SHOTS_DIR || "/tmp/onboarding-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const U = {
  nuevo: "00000000-0000-0000-0000-000000000e01",
  nuevo2: "00000000-0000-0000-0000-000000000e02",
  nuevo3: "00000000-0000-0000-0000-000000000e03",
  existente: "00000000-0000-0000-0000-000000000e10",
  empezado: "00000000-0000-0000-0000-000000000e11",
  existente2: "00000000-0000-0000-0000-000000000e12",
  viewer: "00000000-0000-0000-0000-000000000e20",
  completo: "00000000-0000-0000-0000-000000000e30",
  errores: "00000000-0000-0000-0000-000000000e40",
};

const T = {
  bienvenida: "Conozcamos un poco tus gustos",
  sub: "Esto nos va a ayudar a recomendarte qué tomar",
  tipos: "¿Qué tipos de vino te gustan?",
  variedades: "¿Hay alguna variedad que te guste especialmente?",
  conocimiento: "¿Cómo es tu relación con el vino?",
  cierre: "Listo. Ya nos conocemos un poco mejor",
  errorGuardar: "No pudimos guardar tus respuestas. Revisá tu conexión y probá de nuevo.",
};

function b64(o) {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}
function jwt(payload) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), ...payload });
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function sesion(uid) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@test.local`, app_metadata: {}, user_metadata: {} };
  return {
    access_token: jwt({ role: "authenticated", sub: uid, aud: "authenticated", email: user.email }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh-de-prueba",
    user,
  };
}

async function fila(uid) {
  const r = await fetch(`${REST}/user_preferences?user_id=eq.${uid}`, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: uid })}` },
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  return d[0] || null;
}

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => browser?.close());

const ESCRITORIO = { viewport: { width: 1280, height: 860 } };
const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function abrir(uid, perfil = ESCRITORIO) {
  const context = await browser.newContext({ ...perfil, locale: "es-AR" });
  if (uid) {
    const valor = JSON.stringify(sesion(uid));
    await context.addInitScript((v) => window.localStorage.setItem("sb-127-auth-token", v), valor);
  }
  const page = await context.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(APP);
  return { context, page, errores };
}

const paso = (page, n) => page.locator(`[data-onboarding-paso="${n}"]`);
const tarjeta = (page, preg, id) => page.locator(`[data-pregunta="${preg}"] [data-id="${id}"]`);
const presionada = async (loc) => (await loc.getAttribute("aria-pressed")) === "true";
const idsVariedades = (page) =>
  page.locator('[data-pregunta="variedades"] .onb-card').evaluateAll((els) => els.map((e) => e.dataset.id));
const primaria = (page) => page.locator('[data-accion="primaria"]').first();
const omitir = (page) => page.locator('[data-accion="omitir"]').first();
const atras = (page) => page.locator('[data-accion="atras"]');
const invitacion = (page) => page.locator("[data-invitacion-onboarding]");
const biblioteca = (page, nombre) => page.getByText(`Entraste como`).filter({ hasText: nombre });

async function foto(page, nombre) {
  await page.waitForTimeout(350); // deja terminar las transiciones de color
  await page.screenshot({ path: path.join(SHOTS, `${nombre}.png`), fullPage: true });
}
async function sinDesborde(page, etiqueta) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${etiqueta}: desborde horizontal (${sw} > ${iw})`);
}
async function crearPerfil(page, nombre) {
  await page.getByPlaceholder("Tu nombre").fill(nombre);
  await page.getByRole("button", { name: "Continuar" }).click();
}

// -----------------------------------------------------------------------------
test("A. regresión: sin sesión se ve «Mi Cava es personal»", async () => {
  const { context, page, errores } = await abrir(null);
  await page.getByText("Mi Cava es personal").waitFor();
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test("B. usuario nuevo (escritorio): recorrido completo, prioridad, Atrás, persistencia", async () => {
  const { context, page, errores } = await abrir(U.nuevo);
  await crearPerfil(page, "Nora Nueva");

  // 1. Bienvenida (pantalla completa, sin biblioteca detrás)
  await paso(page, 0).waitFor();
  await page.getByRole("heading", { name: T.bienvenida }).waitFor();
  await page.getByText(T.sub).waitFor();
  assert.equal(await page.getByText("Entraste como").count(), 0);
  assert.equal(await omitir(page).innerText(), "Ahora no, ir a mi cava");
  await foto(page, "escritorio-1-bienvenida");
  await primaria(page).click();

  // 2. Tipos
  await paso(page, 1).waitFor();
  await page.getByRole("heading", { name: T.tipos }).waitFor();
  assert.equal((await fila(U.nuevo)).onboarding_status, "started");
  for (const t of ["Tinto", "Blanco", "Rosado", "Naranjo", "Espumoso"]) {
    await page.locator('[data-pregunta="tipos"] .onb-card', { hasText: t }).first().waitFor();
  }
  await tarjeta(page, "tipos", "espumoso").click();
  await tarjeta(page, "tipos", "probar_todo").click();
  assert.ok(await presionada(tarjeta(page, "tipos", "espumoso")));
  assert.ok(await presionada(tarjeta(page, "tipos", "probar_todo")));
  await tarjeta(page, "tipos", "sin_preferencia").click();
  assert.ok(await presionada(tarjeta(page, "tipos", "sin_preferencia")));
  assert.ok(!(await presionada(tarjeta(page, "tipos", "espumoso"))), "«No tengo preferencia» desmarca tipos");
  assert.ok(!(await presionada(tarjeta(page, "tipos", "probar_todo"))), "y «Me gusta probar de todo»");
  await tarjeta(page, "tipos", "espumoso").click();
  assert.ok(!(await presionada(tarjeta(page, "tipos", "sin_preferencia"))));
  await foto(page, "escritorio-2-tipos");
  await primaria(page).click();

  // 3. Variedades: prioridad de Espumoso, 6 visibles
  await paso(page, 2).waitFor();
  let f = await fila(U.nuevo);
  assert.deepEqual([f.wine_types_answer, f.preferred_wine_types, f.exploration_open, f.onboarding_step], ["answered", ["espumoso"], false, 2]);
  const esperadas = organizarVariedades({ tipos: ["espumoso"] }).sugeridas.map((v) => v.id);
  assert.deepEqual(await idsVariedades(page), esperadas);
  assert.equal(esperadas.length, 6);
  assert.ok(esperadas.includes("chardonnay") && esperadas.includes("pinot_noir"), "Espumoso prioriza Chardonnay y Pinot Noir");
  await tarjeta(page, "variedades", "chardonnay").click();
  await tarjeta(page, "variedades", "malbec").click();
  assert.deepEqual(await idsVariedades(page), esperadas, "marcar no mueve las tarjetas");
  await page.getByRole("button", { name: "Ver más variedades" }).click();
  const todas = await idsVariedades(page);
  assert.equal(todas.length, VARIEDADES.length, "ninguna excluida");
  assert.deepEqual(todas.slice(0, 2), ["chardonnay", "malbec"], "elegidas agrupadas primero al ampliar");
  await tarjeta(page, "variedades", "tannat").click();
  await foto(page, "escritorio-3-variedades-ampliada");

  // Atrás conserva; cambiar tipos no borra variedades
  await atras(page).click();
  await paso(page, 1).waitFor();
  assert.ok(await presionada(tarjeta(page, "tipos", "espumoso")));
  await tarjeta(page, "tipos", "tinto").click();
  await primaria(page).click();
  await paso(page, 2).waitFor();
  const tras = await idsVariedades(page);
  assert.deepEqual(tras.slice(0, 3), ["chardonnay", "malbec", "tannat"]);
  for (const id of ["chardonnay", "malbec", "tannat"]) assert.ok(await presionada(tarjeta(page, "variedades", id)), id);
  assert.equal(tras.length, 3 + 6);
  await primaria(page).click();

  // 4. Conocimiento
  await paso(page, 3).waitFor();
  f = await fila(U.nuevo);
  assert.deepEqual(f.preferred_grapes, ["chardonnay", "malbec", "tannat"]);
  assert.deepEqual(f.preferred_wine_types, ["tinto", "espumoso"]);
  await page.getByText("Todavía estoy conociendo los distintos vinos").waitFor();
  for (const t of ["Estoy empezando", "Me gusta el vino", "Conozco bastante"]) await page.getByText(t, { exact: true }).waitFor();
  await tarjeta(page, "conocimiento", "beginner").click();
  await foto(page, "escritorio-4-conocimiento");
  await primaria(page).click();

  // 5. Cierre
  await paso(page, 4).waitFor();
  await page.getByRole("heading", { name: T.cierre }).waitFor();
  await page.getByText(/favoritos.*puntuaciones.*experiencias/).waitFor();
  assert.equal(await omitir(page).count(), 0);
  assert.equal(await atras(page).count(), 0);
  f = await fila(U.nuevo);
  assert.equal(f.onboarding_status, "completed");
  assert.equal(f.knowledge_level, "beginner");
  assert.equal(f.onboarding_resolved_at, f.updated_at, "fecha de la base");
  await foto(page, "escritorio-5-cierre");
  await page.getByRole("button", { name: "Ir a Mi Cava" }).click();
  await biblioteca(page, "Nora Nueva").waitFor();
  assert.equal(await invitacion(page).count(), 0);

  // No se repite
  await page.reload();
  await biblioteca(page, "Nora Nueva").waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.equal(await invitacion(page).count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test("B2. usuario nuevo (celular): «Ahora no» desde la bienvenida entra directo y no se repite", async () => {
  const { context, page, errores } = await abrir(U.nuevo2, CELULAR);
  await crearPerfil(page, "Ñato Nuevo");
  await paso(page, 0).waitFor();
  await sinDesborde(page, "bienvenida celular");
  await foto(page, "celular-1-bienvenida");
  await omitir(page).click();
  await biblioteca(page, "Ñato Nuevo").waitFor();
  const f = await fila(U.nuevo2);
  assert.equal(f.onboarding_status, "skipped");
  assert.equal(f.onboarding_resolved_at, f.updated_at);
  assert.equal(await invitacion(page).count(), 0);
  await page.reload();
  await biblioteca(page, "Ñato Nuevo").waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.equal(await invitacion(page).count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test("C. usuario existente (escritorio): invitación no bloqueante, omitir pregunta, reanudar, omitir recorrido", async () => {
  const { context, page, errores } = await abrir(U.existente);
  await biblioteca(page, "Ana Existente").waitFor();
  await page.getByText("Gran Reserva de Prueba").first().waitFor();
  await invitacion(page).waitFor();
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0, "no reemplaza la biblioteca");
  assert.equal(await invitacion(page).locator('[data-accion="primaria"]').innerText(), "Empezar");
  await foto(page, "escritorio-6-invitacion");

  // Regresión biblioteca: abrir una ficha sigue funcionando
  await page.getByText("Gran Reserva de Prueba").first().click();
  await page.getByText("Tomado").first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.keyboard.press("Escape");
  await page.reload();
  await invitacion(page).waitFor();

  await invitacion(page).locator('[data-accion="primaria"]').click();
  await paso(page, 1).waitFor();
  await primaria(page).click(); // continuar sin elegir = omitida
  await paso(page, 2).waitFor();
  let f = await fila(U.existente);
  assert.deepEqual([f.onboarding_status, f.wine_types_answer, f.onboarding_step], ["started", "skipped", 2]);

  await page.reload(); // reanudar
  await biblioteca(page, "Ana Existente").waitFor();
  await invitacion(page).waitFor();
  assert.equal(await invitacion(page).locator('[data-accion="primaria"]').innerText(), "Continuar");
  await invitacion(page).locator('[data-accion="primaria"]').click();
  await paso(page, 2).waitFor();
  await atras(page).click();
  await paso(page, 1).waitFor();
  for (const id of ["tinto", "blanco", "rosado", "naranjo", "espumoso", "probar_todo", "sin_preferencia"]) {
    assert.ok(!(await presionada(tarjeta(page, "tipos", id))), id);
  }
  await omitir(page).click();
  await biblioteca(page, "Ana Existente").waitFor();
  assert.equal(await invitacion(page).count(), 0);
  f = await fila(U.existente);
  assert.deepEqual([f.onboarding_status, f.wine_types_answer], ["skipped", "skipped"]);
  await page.reload();
  await page.getByText("Gran Reserva de Prueba").first().waitFor();
  await page.waitForTimeout(800);
  assert.equal(await invitacion(page).count(), 0, "no se repite");
  assert.deepEqual(errores, []);
  await context.close();
});

test("D. usuario existente con progreso (celular): reanuda, «No tengo preferencia» no borra variedades", async () => {
  const { context, page, errores } = await abrir(U.empezado, CELULAR);
  await biblioteca(page, "Beto Empezado").waitFor();
  await invitacion(page).waitFor();
  await sinDesborde(page, "invitación celular");
  await foto(page, "celular-2-invitacion");
  await invitacion(page).locator('[data-accion="primaria"]').click();
  await paso(page, 2).waitFor();
  assert.equal((await idsVariedades(page))[0], "glera");
  assert.ok(await presionada(tarjeta(page, "variedades", "glera")));
  await atras(page).click();
  await paso(page, 1).waitFor();
  assert.ok(await presionada(tarjeta(page, "tipos", "espumoso")));
  await tarjeta(page, "tipos", "sin_preferencia").click();
  await sinDesborde(page, "tipos celular");
  await foto(page, "celular-3-tipos");
  await primaria(page).click();
  await paso(page, 2).waitFor();
  assert.ok(await presionada(tarjeta(page, "variedades", "glera")), "la variedad sigue elegida");
  assert.deepEqual(await idsVariedades(page), ["glera", ...organizarVariedades({ seleccionadas: ["glera"] }).sugeridas.map((v) => v.id)]);
  await sinDesborde(page, "variedades celular");
  await foto(page, "celular-4-variedades");
  await primaria(page).click();
  await paso(page, 3).waitFor();
  await sinDesborde(page, "conocimiento celular");
  await foto(page, "celular-5-conocimiento");
  await primaria(page).click(); // sin elegir
  await paso(page, 4).waitFor();
  await sinDesborde(page, "cierre celular");
  await foto(page, "celular-6-cierre");
  const f = await fila(U.empezado);
  assert.deepEqual(
    [f.onboarding_status, f.wine_types_answer, f.preferred_wine_types, f.preferred_grapes, f.knowledge_level],
    ["completed", "no_preference", [], ["glera"], null]
  );
  await page.getByRole("button", { name: "Ir a Mi Cava" }).click();
  await biblioteca(page, "Beto Empezado").waitFor();
  assert.equal(await invitacion(page).count(), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test("E. viewer: sin onboarding, sin invitación, sin «Mis preferencias», sin consultas de preferencias", async () => {
  const context = await browser.newContext({ ...ESCRITORIO });
  await context.addInitScript((v) => window.localStorage.setItem("sb-127-auth-token", v), JSON.stringify(sesion(U.viewer)));
  const page = await context.newPage();
  const consultas = [];
  page.on("request", (r) => r.url().includes("user_preferences") && consultas.push(r.url()));
  await page.goto(APP);
  await page.getByText("Todavía no tenés tu propia Cava").waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await invitacion(page).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Mis preferencias" }).count(), 0);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.deepEqual(consultas, []);
  await context.close();
});

test("F. edición posterior en «Mis preferencias» sin alterar completed", async () => {
  const { context, page, errores } = await abrir(U.completo);
  await biblioteca(page, "Dani Completo").waitFor();
  await page.waitForTimeout(600);
  assert.equal(await invitacion(page).count(), 0);
  await page.getByRole("button", { name: "Mis preferencias" }).click();
  const modal = page.locator("[data-mis-preferencias]");
  await modal.getByRole("heading", { name: "Mis preferencias" }).waitFor();
  assert.ok(await presionada(tarjeta(page, "tipos", "tinto")));
  assert.ok(await presionada(tarjeta(page, "variedades", "malbec")));
  assert.ok(await presionada(tarjeta(page, "conocimiento", "intermediate")));

  // Cancelar no escribe
  const parches = [];
  page.on("request", (r) => r.method() !== "GET" && r.url().includes("user_preferences") && parches.push(r.method()));
  await modal.locator('[data-accion="cancelar"]').click();
  await modal.waitFor({ state: "detached" });
  assert.deepEqual(parches, []);

  await page.getByRole("button", { name: "Mis preferencias" }).click();
  await tarjeta(page, "tipos", "blanco").click();
  await tarjeta(page, "variedades", "torrontes").click();
  await tarjeta(page, "conocimiento", "advanced").click();
  await foto(page, "escritorio-7-mis-preferencias");
  await page.locator('[data-mis-preferencias] [data-accion="guardar"]').click();
  await page.locator("[data-mis-preferencias]").waitFor({ state: "detached" });
  const f = await fila(U.completo);
  assert.deepEqual(f.preferred_wine_types, ["tinto", "blanco"]);
  assert.deepEqual(f.preferred_grapes, ["malbec", "torrontes"]);
  assert.equal(f.knowledge_level, "advanced");
  assert.equal(f.onboarding_status, "completed");
  assert.equal(new Date(f.onboarding_resolved_at).toISOString(), "2026-11-01T12:00:00.000Z", "fecha de cierre intacta");
  assert.equal(f.onboarding_step, 4);
  assert.equal(await invitacion(page).count(), 0);
  assert.deepEqual(errores, []);
  await context.close();

  // Celular: el modal ocupa la pantalla sin desborde
  const m = await abrir(U.completo, CELULAR);
  await biblioteca(m.page, "Dani Completo").waitFor();
  await m.page.getByRole("button", { name: "Mis preferencias" }).click();
  await m.page.locator("[data-mis-preferencias] h2").waitFor();
  await sinDesborde(m.page, "Mis preferencias celular");
  await m.page.waitForTimeout(350);
  await m.page.screenshot({ path: path.join(SHOTS, "celular-7-mis-preferencias.png") });
  await m.context.close();
});

test("G1. error de lectura: la biblioteca carga, sin invitación; «Mis preferencias» permite reintentar", async () => {
  const { context, page, errores } = await abrir(null);
  await context.addInitScript((v) => window.localStorage.setItem("sb-127-auth-token", v), JSON.stringify(sesion(U.errores)));
  await page.route("**/rest/v1/user_preferences**", (r) => r.abort("internetdisconnected"));
  await page.goto(APP);
  await biblioteca(page, "Eli Errores").waitFor();
  await page.waitForTimeout(800);
  assert.equal(await invitacion(page).count(), 0);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  await page.getByRole("button", { name: "Mis preferencias" }).click();
  await page.getByText("No pudimos cargar tus preferencias.").waitFor();
  assert.ok(await page.locator('[data-mis-preferencias] [data-accion="guardar"]').isDisabled(), "no se puede guardar sin leer");
  await page.unroute("**/rest/v1/user_preferences**");
  await page.getByRole("button", { name: "Reintentar" }).click();
  await page.locator('[data-mis-preferencias] [data-pregunta="tipos"]').waitFor();
  assert.equal(await fila(U.errores), null, "no se escribió nada");
  assert.deepEqual(errores, []);
  await context.close();
});

test("G2. error de escritura: no avanza, conserva la selección, «Ahora no» no bloquea y la invitación vuelve después", async () => {
  const { context, page, errores } = await abrir(U.existente2);
  await biblioteca(page, "Caro Existente").waitFor();
  await invitacion(page).waitFor();
  await invitacion(page).locator('[data-accion="primaria"]').click();
  await paso(page, 1).waitFor();
  await page.waitForTimeout(500); // deja terminar el registro de inicio
  await tarjeta(page, "tipos", "tinto").click();
  await page.route("**/rest/v1/user_preferences**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort("internetdisconnected")));
  await primaria(page).click();
  await page.getByRole("alert").filter({ hasText: T.errorGuardar }).waitFor();
  assert.equal(await paso(page, 1).count(), 1, "no avanzó");
  assert.ok(await presionada(tarjeta(page, "tipos", "tinto")), "selección conservada");
  await foto(page, "escritorio-8-error-guardar");
  await omitir(page).click();
  await biblioteca(page, "Caro Existente").waitFor();
  assert.equal(await invitacion(page).count(), 0, "no insiste en la sesión");
  const f = await fila(U.existente2);
  assert.notEqual(f?.onboarding_status, "skipped", "el «Ahora no» fallido no se dio por guardado");
  assert.equal(f?.wine_types_answer ?? null, null);
  await page.unroute("**/rest/v1/user_preferences**");
  await page.reload();
  await invitacion(page).waitFor();
  assert.deepEqual(errores, []);
  await context.close();
});

test("G3. lectura colgada tras crear el perfil: espera acotada y entra a la cava", async () => {
  const { context, page, errores } = await abrir(U.nuevo3);
  await page.route("**/rest/v1/user_preferences**", () => {}); // nunca responde
  await crearPerfil(page, "Olga Nueva");
  const t0 = Date.now();
  await biblioteca(page, "Olga Nueva").waitFor({ timeout: 20000 });
  const espera = Date.now() - t0;
  assert.ok(espera < 15000, `esperó ${espera} ms`);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.equal(await fila(U.nuevo3), null, "no se escribió nada");
  assert.deepEqual(errores, []);
  await context.close();
});

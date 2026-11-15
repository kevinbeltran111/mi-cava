// =============================================================================
// 7.2 con AUTENTICACIÓN REAL: Magic Link de GoTrue (Supabase Auth) → app real
// → onboarding y «Mis preferencias» sobre una base local con 7.2-A.
// Lo lanza supabase/tests/run_magic_link_local.sh. Nunca contra Producción.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const APP = process.env.APP_URL;
const REST = process.env.PGRST_URL;
const BUZON = process.env.BUZON_DIR;
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const SHOTS = process.env.SHOTS_DIR || "/tmp/onboarding-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const NUEVA = "nueva.real@test.local";
const EXISTENTE = "existente.real@test.local";

let browser;
before(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => browser?.close());

function decodificarQP(txt) {
  return txt
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function esperarEmail(destino, desde, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const f of fs.readdirSync(BUZON).sort()) {
      const p = path.join(BUZON, f);
      if (fs.statSync(p).mtimeMs < desde) continue;
      const raw = fs.readFileSync(p, "utf8");
      if (raw.split("\r\n")[0].includes(destino)) return decodificarQP(raw);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function linkDeVerificacion(eml) {
  const m = eml.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
  return m ? m[0].replace(/&amp;/g, "&") : null;
}

async function pedirLink(page, email) {
  await page.getByRole("button", { name: "Iniciar sesión" }).first().click();
  await page.getByPlaceholder("tu@mail.com").first().fill(email);
  const desde = Date.now() - 50;
  await page.getByRole("button", { name: "Enviar link" }).click();
  return desde;
}

async function entrarConMagicLink(page, email) {
  const desde = await pedirLink(page, email);
  await page.getByText(`Te mandamos un link a`).waitFor();
  const eml = await esperarEmail(email, desde);
  assert.ok(eml, `llegó el email a ${email}`);
  const link = linkDeVerificacion(eml);
  assert.ok(link, "el email trae el link de verificación");
  assert.match(link, /type=magiclink/);
  await page.goto(link); // GoTrue verifica el token y redirige a la app con la sesión
  return link;
}

// Consulta con el token REAL emitido por GoTrue (RLS real).
async function filaConTokenReal(page) {
  const ses = await page.evaluate(() => JSON.parse(localStorage.getItem("sb-127-auth-token") || "null"));
  assert.ok(ses?.access_token, "hay sesión de GoTrue en el navegador");
  const r = await fetch(`${REST}/user_preferences?select=*`, { headers: { Authorization: `Bearer ${ses.access_token}` } });
  assert.equal(r.status, 200);
  const filas = await r.json();
  assert.ok(filas.length <= 1, "RLS: solo la propia fila");
  return { fila: filas[0] || null, userId: ses.user.id };
}

const paso = (page, n) => page.locator(`[data-onboarding-paso="${n}"]`);
const primaria = (page) => page.locator('[data-accion="primaria"]').first();
const invitacion = (page) => page.locator("[data-invitacion-onboarding]");

test("ML0. email no invitado: no se envía link (signups cerrados, como Producción)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(APP);
  const desde = await pedirLink(page, "desconocido@test.local");
  await page.getByText("Todavía no tenés acceso a CavaVinos.").waitFor();
  assert.equal(await esperarEmail("desconocido@test.local", desde, 2500), null);
  await ctx.close();
});

test("ML1. usuaria nueva (escritorio): Magic Link real → perfil → onboarding completo → no se repite al volver a entrar", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(APP);
  await page.getByText("Mi Cava es personal").waitFor();
  await entrarConMagicLink(page, NUEVA);

  await page.getByPlaceholder("Tu nombre").fill("Nadia Real");
  await page.getByRole("button", { name: "Continuar" }).click();
  await paso(page, 0).waitFor();
  await page.screenshot({ path: path.join(SHOTS, "magic-link-1-bienvenida.png") });
  await primaria(page).click();
  await paso(page, 1).waitFor();
  await page.locator('[data-pregunta="tipos"] [data-id="espumoso"]').click();
  await primaria(page).click();
  await paso(page, 2).waitFor();
  await page.locator('[data-pregunta="variedades"] [data-id="chardonnay"]').click();
  await primaria(page).click();
  await paso(page, 3).waitFor();
  await page.locator('[data-pregunta="conocimiento"] [data-id="intermediate"]').click();
  await primaria(page).click();
  await paso(page, 4).waitFor();

  const { fila, userId } = await filaConTokenReal(page);
  assert.equal(fila.user_id, userId);
  assert.deepEqual(
    [fila.onboarding_status, fila.wine_types_answer, fila.preferred_wine_types, fila.preferred_grapes, fila.knowledge_level],
    ["completed", "answered", ["espumoso"], ["chardonnay"], "intermediate"]
  );
  assert.equal(fila.onboarding_resolved_at, fila.updated_at);

  await page.getByRole("button", { name: "Ir a Mi Cava" }).click();
  await page.getByText("Entraste como").filter({ hasText: "Nadia Real" }).waitFor();

  // Cerrar sesión y volver a entrar con un Magic Link nuevo
  await page.getByRole("button", { name: "cerrar sesión" }).click();
  await page.getByText("Mi Cava es personal").waitFor();
  await entrarConMagicLink(page, NUEVA);
  await page.getByText("Entraste como").filter({ hasText: "Nadia Real" }).waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0, "no se repite el onboarding");
  assert.equal(await invitacion(page).count(), 0, "ni la invitación");
  assert.deepEqual(errores, []);
  await ctx.close();
});

test("ML2. usuaria existente (celular): Magic Link real → invitación → «Ahora no» → «Mis preferencias»", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(APP);
  await entrarConMagicLink(page, EXISTENTE);
  await page.getByText("Malbec de la Beta").first().waitFor();
  await invitacion(page).waitFor();
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0, "no reemplaza la biblioteca");
  await page.screenshot({ path: path.join(SHOTS, "magic-link-2-invitacion-celular.png") });
  await invitacion(page).locator('[data-accion="omitir"]').tap();
  await invitacion(page).waitFor({ state: "detached" });
  let { fila } = await filaConTokenReal(page);
  assert.equal(fila.onboarding_status, "skipped");

  await page.getByRole("button", { name: "Mis preferencias" }).tap();
  await page.locator('[data-mis-preferencias] [data-pregunta="tipos"] [data-id="tinto"]').tap();
  await page.locator('[data-mis-preferencias] [data-pregunta="conocimiento"] [data-id="advanced"]').tap();
  await page.locator('[data-mis-preferencias] [data-accion="guardar"]').tap();
  await page.locator("[data-mis-preferencias]").waitFor({ state: "detached" });
  ({ fila } = await filaConTokenReal(page));
  assert.deepEqual([fila.onboarding_status, fila.preferred_wine_types, fila.knowledge_level], ["skipped", ["tinto"], "advanced"]);

  await page.reload();
  await page.getByText("Malbec de la Beta").first().waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await invitacion(page).count(), 0, "la invitación no vuelve");
  assert.deepEqual(errores, []);
  await ctx.close();
});

// =============================================================================
// E2E 7.2-B «Preview sin 7.2-A»: la app nueva contra una base con 7.1 pero SIN
// la migración 20261110000000 (situación de un Preview de Vercel, que usa
// Supabase Producción). Verifica que el onboarding queda inerte: la
// biblioteca funciona, no se muestra nada y NO se escribe en
// user_preferences. Lo lanza run_onboarding_e2e.sh con HASTA_71=1.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const APP = process.env.APP_URL;
const REST = process.env.PGRST_URL;
const SECRET = process.env.IT_JWT_SECRET;
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(payload) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
const sesion = (uid) => ({
  access_token: jwt({ role: "authenticated", sub: uid, aud: "authenticated" }),
  token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "r", user: { id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@test.local` },
});
async function filas(uid) {
  const r = await fetch(`${REST}/user_preferences?user_id=eq.${uid}&select=user_id`, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: uid })}` },
  });
  assert.equal(r.status, 200);
  return (await r.json()).length;
}

let browser;
before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] }); });
after(async () => browser?.close());

async function abrir(uid) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await context.addInitScript((v) => window.localStorage.setItem("sb-127-auth-token", v), JSON.stringify(sesion(uid)));
  const page = await context.newPage();
  const escrituras = [];
  const errores = [];
  page.on("request", (r) => r.url().includes("user_preferences") && r.method() !== "GET" && escrituras.push(`${r.method()} ${r.url()}`));
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(APP);
  return { context, page, escrituras, errores };
}

test("esquema sin 7.2-A confirmado", async () => {
  const r = await fetch(`${REST}/user_preferences?select=wine_types_answer&limit=1`, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: "00000000-0000-0000-0000-000000000e10" })}` },
  });
  assert.equal(r.status, 400, "la columna de 7.2-A no debe existir en esta base");
});

test("usuario existente: biblioteca normal, sin invitación, sin escrituras", async () => {
  const { context, page, escrituras, errores } = await abrir("00000000-0000-0000-0000-000000000e10");
  await page.getByText("Gran Reserva de Prueba").first().waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("[data-invitacion-onboarding]").count(), 0);
  await page.getByRole("button", { name: "Mis preferencias" }).click();
  await page.getByText("No pudimos cargar tus preferencias.").waitFor();
  assert.ok(await page.locator('[data-mis-preferencias] [data-accion="guardar"]').isDisabled());
  assert.deepEqual(escrituras, []);
  assert.equal(await filas("00000000-0000-0000-0000-000000000e10"), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

test("usuario nuevo: crea su perfil y entra a la cava sin onboarding ni escrituras", async () => {
  const uid = "00000000-0000-0000-0000-000000000e01";
  const { context, page, escrituras, errores } = await abrir(uid);
  await page.getByPlaceholder("Tu nombre").fill("Nora Preview");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("Entraste como").filter({ hasText: "Nora Preview" }).waitFor();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("[data-onboarding-paso]").count(), 0);
  assert.equal(await page.locator("[data-invitacion-onboarding]").count(), 0);
  assert.deepEqual(escrituras, []);
  assert.equal(await filas(uid), 0);
  assert.deepEqual(errores, []);
  await context.close();
});

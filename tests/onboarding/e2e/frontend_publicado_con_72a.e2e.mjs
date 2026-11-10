// =============================================================================
// Despliegue parcial: el frontend PUBLICADO (main, sin onboarding) contra una
// base CON la migración 7.2-A. Caso «la migración se aplica y el frontend
// todavía no se despliega». Lanzar con:
//   git worktree add /tmp/mi-cava-publicado ab925f6
//   APP_SRC=/tmp/mi-cava-publicado E2E_FILE=tests/onboarding/e2e/frontend_publicado_con_72a.e2e.mjs \
//     ./supabase/tests/run_onboarding_e2e.sh
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

let browser;
before(async () => { browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] }); });
after(async () => browser?.close());

async function abrir(uid, movil = false) {
  const context = await browser.newContext(movil
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1280, height: 860 } });
  if (uid) await context.addInitScript((v) => window.localStorage.setItem("sb-127-auth-token", v), JSON.stringify(sesion(uid)));
  const page = await context.newPage();
  const consultas = [];
  const errores = [];
  page.on("request", (r) => r.url().includes("user_preferences") && consultas.push(r.method()));
  page.on("pageerror", (e) => errores.push(String(e)));
  await page.goto(APP);
  return { context, page, consultas, errores };
}

test("base con 7.2-A confirmada", async () => {
  const r = await fetch(`${REST}/user_preferences?select=wine_types_answer&limit=1`, {
    headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: "00000000-0000-0000-0000-000000000e10" })}` },
  });
  assert.equal(r.status, 200);
});

test("frontend publicado: biblioteca, ficha y alta de perfil funcionan; no usa preferencias", async () => {
  const sinSesion = await abrir(null);
  await sinSesion.page.getByText("Mi Cava es personal").waitFor();
  await sinSesion.context.close();

  const { context, page, consultas, errores } = await abrir("00000000-0000-0000-0000-000000000e10");
  await page.getByText("Gran Reserva de Prueba").first().waitFor();
  await page.getByText("2 vinos registrados").waitFor();
  await page.getByText("Gran Reserva de Prueba").first().click();
  await page.getByText("Abrir una botella").first().waitFor();
  assert.equal(await page.getByText("Mis preferencias").count(), 0, "es el frontend publicado (sin onboarding)");
  assert.deepEqual(consultas, []);
  assert.deepEqual(errores, []);
  await context.close();

  const nuevo = await abrir("00000000-0000-0000-0000-000000000e01", true);
  await nuevo.page.getByPlaceholder("Tu nombre").fill("Nora Publicada");
  await nuevo.page.getByRole("button", { name: "Continuar" }).click();
  await nuevo.page.getByText("Entraste como").filter({ hasText: "Nora Publicada" }).waitFor();
  assert.deepEqual(nuevo.consultas, []);
  assert.deepEqual(nuevo.errores, []);
  await nuevo.context.close();
});

// =============================================================================
// E2E 7.4-B4: «Elegir de mi cava» con la app REAL (build de Vite) en Chrome,
// escritorio y celular. Backend: servidor_memoria.mjs (handler real de
// /api/que-tomo sobre el doble en memoria). Lo lanza
// supabase/tests/run_elegir_e2e_local.sh. No toca ninguna base real.
// =============================================================================
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { iniciarServidor } from "./servidor_memoria.mjs";
import { crearBase, USUARIO } from "../supabase_en_memoria.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const DIST = process.env.APP_DIST;
const PUERTO = Number(process.env.E2E_PORT || 54398);
const CHROME = process.env.CHROME_BIN || "/usr/bin/google-chrome";
const SHOTS = process.env.SHOTS_DIR || "/tmp/elegir-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PREF = {
  onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"], exploration_open: true,
  preferred_grapes: ["cabernet_franc"], knowledge_level: "intermediate", onboarding_step: 4,
  onboarding_resolved_at: "2026-11-15T10:00:00Z", updated_at: "2026-11-15T10:00:00Z",
};
const VINOS = {
  malbec: { id: v(1), nombre: "Malbec Reserva de la Familia", bodega: "Bodega Norte", varietal: "Malbec", anada: 2020, stock: 2, favorito: true, puntuaciones: [4.5] },
  merlot: { id: v(2), nombre: "Gran Merlot", bodega: "Bodega Sur", varietal: "Merlot", anada: 2019, stock: 1, puntuaciones: [4] },
  franc: { id: v(4), nombre: "Cabernet Franc Joven", bodega: "Finca Alta", varietal: "Cabernet Franc", anada: 2022, stock: 3 },
  casa: { id: v(5), nombre: "Tinto de la casa", bodega: "Almacén", stock: 1 },
  bonarda: { id: v(6), nombre: "Bonarda Clásica", bodega: "Bodega Este", varietal: "Bonarda", anada: 2018, stock: 0, puntuaciones: [5] },
  corte: { id: v(7), nombre: "Corte del Valle", bodega: "Bodega Oeste", varietal: "Malbec - Syrah", anada: 2021, stock: 1, puntuaciones: [5] },
};
const CAVA = () => ({ preferencias: PREF, vinos: Object.values(VINOS).map((w) => ({ ...w })) });

let browser;
let srv;
before(async () => {
  srv = await iniciarServidor({ dist: DIST, puerto: PUERTO });
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
});
after(async () => { await browser?.close(); await srv?.cerrar(); });

const ESCRITORIO = { viewport: { width: 1280, height: 900 } };
const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

function sesion() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USUARIO, role: "authenticated", aud: "authenticated", exp })}.firma-de-prueba`;
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r", user: { id: USUARIO, aud: "authenticated", role: "authenticated", email: "kevin@test.local", app_metadata: {}, user_metadata: {} } };
}

async function abrirApp(escenario, perfil = ESCRITORIO) {
  const base = crearBase(escenario);
  srv.usar(base);
  const context = await browser.newContext({ ...perfil, locale: "es-AR" });
  await context.addInitScript((s) => window.localStorage.setItem("sb-127-auth-token", s), JSON.stringify(sesion()));
  const page = await context.newPage();
  await page.goto(srv.url);
  await page.getByRole("button", { name: "Elegir de mi cava" }).waitFor({ timeout: 15000 });
  return { base, page, context };
}

const foto = (page, nombre) => page.screenshot({ path: path.join(SHOTS, `${nombre}.png`), fullPage: false });
const eventos = (base, tipo) => base.tablas.recommendation_events.filter((e) => !tipo || e.event_type === tipo);
async function esperar(cond, ms = 5000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (cond()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail("tiempo agotado esperando la condición");
}
const nombres = async (page) => page.locator('[data-testid^="rec-"] h3').allInnerTexts();
const llamadas = (filtro) => srv.control.llamadasApi.filter(filtro);

test("entrada directa: principal + 2 alternativas con explicación; shown una vez por ítem", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  assert.deepEqual(await nombres(page), ["Malbec Reserva de la Familia", "Corte del Valle", "Cabernet Franc Joven"]);
  await page.getByText("Lo marcaste como favorito. Lo puntuaste con 4,5 estrellas.").waitFor();
  await page.getByText("Para explorar").waitFor();
  await foto(page, "01-entrada-escritorio");
  await esperar(() => eventos(base, "shown").length === 3);
  assert.equal(llamadas((b) => b.modo === "cellar" && !b.sesionId && !b.accion).length, 1, "pide la primera tanda directamente");
  await context.close();
});

test("refinamiento: «Hoy no quiero Malbec» en la misma consulta, aviso incierto, doble toque = un pedido; consulta nueva sin filtros", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  const sesion1 = base.tablas.recommendation_sessions[0].id;
  await page.getByRole("button", { name: "Hoy no quiero Malbec" }).dblclick();
  await page.getByTestId("filtros-aplicados").waitFor();
  assert.deepEqual(await nombres(page), ["Gran Merlot", "Cabernet Franc Joven", "Tinto de la casa"]);
  await page.getByText("No sabemos si este vino es Malbec: su varietal no está registrado.").waitFor();
  await page.getByText("Excluimos los vinos registrados con esas variedades.").waitFor();
  assert.equal(llamadas((b) => b.restriccion).length, 1, "el doble toque no duplica el pedido");
  assert.equal(base.tablas.recommendation_sessions.length, 1, "misma consulta");
  await foto(page, "02-refinamiento-escritorio");
  await esperar(() => eventos(base, "new_batch").length === 1 && eventos(base, "shown").length === 6);
  assert.deepEqual(eventos(base, "new_batch")[0].payload, { origen: "refinamiento", tanda: 2, resultado: "ok", motivo: null, filtros: ["malbec"] });

  await page.getByRole("button", { name: "Nueva consulta" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await esperar(() => base.tablas.recommendation_sessions.length === 2);
  assert.equal(await page.getByTestId("filtros-aplicados").count(), 0, "los filtros se limpian");
  assert.equal((await nombres(page))[0], "Malbec Reserva de la Familia");
  assert.notEqual(base.tablas.recommendation_sessions[1].id, sesion1);
  await foto(page, "03-consulta-nueva-escritorio");
  await context.close();
});

test("reserva: sale de la tanda, «Deshacer» la revoca y vuelve la tanda anterior; la ficha refleja y quita la reserva persistida", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await page.getByTestId("rec-principal").getByRole("button", { name: "Guardar para una ocasión especial" }).click();
  await page.getByTestId("aviso-reserva").waitFor();
  assert.equal((await nombres(page)).includes("Malbec Reserva de la Familia"), false);
  await foto(page, "04-reserva-con-deshacer-escritorio");
  const reserva = () => base.tablas.user_knowledge.find((k) => k.wine_id === VINOS.malbec.id && k.value?.marca === "reserva");
  assert.equal(reserva().status, "active");

  await page.getByRole("button", { name: "Deshacer" }).click();
  await page.getByText("Quitaste la reserva de «Malbec Reserva de la Familia».").waitFor();
  assert.equal((await nombres(page))[0], "Malbec Reserva de la Familia", "vuelve la tanda anterior");
  assert.equal(reserva().status, "revoked");
  await new Promise((r) => setTimeout(r, 300));
  const shown = eventos(base, "shown");
  assert.equal(new Set(shown.map((e) => e.id)).size, shown.length, "sin eventos duplicados al volver a la tanda anterior");
  assert.equal(shown.filter((e) => e.payload.tanda === 1).length, 3);

  // Reservar otra vez y verla en la ficha del vino.
  await page.getByTestId("rec-principal").getByRole("button", { name: "Guardar para una ocasión especial" }).click();
  await page.getByTestId("aviso-reserva").getByText("quedó guardado").waitFor();
  await page.getByRole("button", { name: "Volver a Mi Cava" }).click();
  await page.getByText("Malbec Reserva de la Familia").first().click();
  await page.getByTestId("ficha-reserva").waitFor();
  await foto(page, "05-ficha-reservado-escritorio");
  await page.getByRole("button", { name: "Quitar la reserva" }).click();
  await page.getByTestId("ficha-reserva").waitFor({ state: "detached" });
  assert.equal(reserva().status, "revoked");
  await page.keyboard.press("Escape");
  await page.getByText("Malbec Reserva de la Familia").first().click();
  await page.getByText("Abrir una botella").waitFor();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(await page.getByTestId("ficha-reserva").count(), 0, "al reabrir, refleja el estado persistido");
  await context.close();
});

test("reserva guardada sin nueva tanda: confirma la reserva y permite reintentar la recomendación", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  base.fallar("recommendation_items:insert");
  await page.getByTestId("rec-principal").getByRole("button", { name: "Guardar para una ocasión especial" }).click();
  await page.getByTestId("estado-reserva-sin-tanda").waitFor();
  await page.getByText("quedó guardado para una ocasión especial").waitFor();
  await foto(page, "06-reserva-sin-tanda-escritorio");
  base.reparar("recommendation_items:insert");
  await page.getByRole("button", { name: "Reintentar la recomendación" }).click();
  await page.getByTestId("rec-principal").waitFor();
  assert.equal((await nombres(page)).includes("Malbec Reserva de la Familia"), false);
  assert.equal(base.tablas.user_knowledge.filter((k) => k.value?.marca === "reserva").length, 1, "el reintento no duplica la reserva");
  await context.close();
});

test("abrir esta botella: flujo de apertura existente; confirmada → selected + bottle_opened; cancelada → solo selected", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await page.getByTestId("rec-principal").getByRole("button", { name: "Abrir esta botella" }).click();
  await page.getByText("¿Abrís una botella?").waitFor();
  await foto(page, "07-apertura-dialogo-escritorio");
  await page.getByRole("button", { name: "Abrir", exact: true }).click();
  await page.getByText("Botella registrada").waitFor();
  await foto(page, "08-apertura-confirmada-escritorio");
  await esperar(() => eventos(base, "bottle_opened").length === 1);
  const consumo = base.tablas.consumos.find((c) => c.id === eventos(base, "bottle_opened")[0].payload.consumoId);
  assert.equal(consumo.wine_id, VINOS.malbec.id);
  assert.equal(base.tablas.wine_privado.find((p) => p.wine_id === VINOS.malbec.id).stock, 1);
  await page.keyboard.press("Escape");
  await page.getByText("🍷 Abriste una botella").waitFor();
  await page.getByTestId("rec-principal").getByText("Tenés 1 botella").waitFor(); // stock actualizado

  // Cancelada: elección sin apertura confirmada.
  await page.getByTestId("rec-alternativa").first().getByRole("button", { name: "Abrir esta botella" }).click();
  await page.getByText("¿Abrís una botella?").waitFor();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.keyboard.press("Escape");
  await esperar(() => eventos(base, "selected").length === 2);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(eventos(base, "bottle_opened").length, 1, "cancelar no registra apertura");
  await foto(page, "09-tras-apertura-escritorio");
  await context.close();
});

test("una sola opción disponible", async () => {
  const { page, context } = await abrirApp({ preferencias: PREF, vinos: [{ ...VINOS.merlot }, { ...VINOS.bonarda }] });
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByText("Es el único vino disponible que cumple lo de hoy.").waitFor();
  assert.deepEqual(await nombres(page), ["Gran Merlot"]);
  await foto(page, "10-una-opcion-escritorio");
  await context.close();
});

test("estados vacíos con su acción: cava vacía, sin stock, sin resultados por filtro y por reserva", async () => {
  // Medición: cada consulta sin candidatos queda como una sesión cerrada sin ítems.
  const cerradaCon = (base, motivo) => {
    const s = base.tablas.recommendation_sessions;
    assert.deepEqual(s.map((x) => [x.status, x.context.resultado, x.context.motivo]), [["completed", "sin_candidatos", motivo]]);
    assert.equal(base.tablas.recommendation_items.length, 0);
  };
  let { base, page, context } = await abrirApp({ preferencias: PREF, vinos: [] });
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("estado-biblioteca_vacia").waitFor();
  cerradaCon(base, "biblioteca_vacia");
  await page.getByRole("button", { name: "Agregar vino" }).last().waitFor();
  await foto(page, "11-cava-vacia-escritorio");
  await context.close();

  ({ base, page, context } = await abrirApp({ preferencias: PREF, vinos: [{ ...VINOS.bonarda }] }));
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("estado-sin_stock").waitFor();
  cerradaCon(base, "sin_stock");
  await page.getByText("No tenés botellas disponibles").waitFor();
  await foto(page, "12-sin-stock-escritorio");
  await context.close();

  ({ page, context } = await abrirApp({ preferencias: PREF, vinos: [{ ...VINOS.malbec }] }));
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByRole("button", { name: "Hoy no quiero Malbec" }).click();
  await page.getByTestId("estado-excluidos_por_filtro").waitFor();
  await foto(page, "13-sin-resultados-filtro-escritorio");
  await page.getByRole("button", { name: "Empezar de nuevo sin filtros" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await page.getByTestId("rec-principal").getByRole("button", { name: "Guardar para una ocasión especial" }).click();
  await page.getByTestId("estado-excluidos_por_reserva").waitFor();
  await foto(page, "14-sin-resultados-reserva-escritorio");
  await page.getByRole("button", { name: "Deshacer la reserva" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await context.close();
});

test("error al pedir la tanda: mensaje y reintento", async () => {
  const { page, context } = await abrirApp(CAVA());
  srv.control.fallasApi = 1;
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("estado-error").waitFor();
  await foto(page, "15-error-escritorio");
  await page.getByRole("button", { name: "Reintentar" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await context.close();
});

test("respuesta vieja descartada: cerrar y reabrir mientras la primera tanda está en curso", async () => {
  const { base, page, context } = await abrirApp(CAVA());
  srv.control.retrasoApiMs = 1500;
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("estado-cargando").waitFor();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  srv.control.retrasoApiMs = 0;
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await esperar(() => base.tablas.recommendation_sessions.length === 2, 6000);
  await new Promise((r) => setTimeout(r, 400));
  const [vieja, nueva] = [...base.tablas.recommendation_sessions].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
  const shownPorSesion = (id) => eventos(base, "shown").filter((e) => e.session_id === id).length;
  assert.equal(shownPorSesion(vieja.id) + shownPorSesion(nueva.id), 3, "solo una tanda llegó a verse");
  await context.close();
});

test("celular: entrada, refinamiento, reserva y ficha", async () => {
  const { page, context } = await abrirApp(CAVA(), CELULAR);
  await foto(page, "16-mi-cava-acceso-celular");
  await page.getByRole("button", { name: "Elegir de mi cava" }).click();
  await page.getByTestId("rec-principal").waitFor();
  await foto(page, "17-entrada-celular");
  await page.getByRole("button", { name: "Hoy no quiero Malbec" }).click();
  await page.getByTestId("filtros-aplicados").waitFor();
  await page.getByTestId("filtros-aplicados").scrollIntoViewIfNeeded();
  await foto(page, "18-refinamiento-celular");
  await page.getByTestId("rec-principal").getByRole("button", { name: "Guardar para una ocasión especial" }).click();
  await page.getByTestId("aviso-reserva").waitFor();
  await page.getByTestId("aviso-reserva").scrollIntoViewIfNeeded();
  await foto(page, "19-reserva-celular");
  await page.getByRole("button", { name: "Volver a Mi Cava" }).click();
  await page.getByText("Gran Merlot").first().click();
  await page.getByTestId("ficha-reserva").waitFor();
  await page.getByTestId("ficha-reserva").scrollIntoViewIfNeeded();
  await foto(page, "20-ficha-reservado-celular");
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(ancho <= 390, `sin desborde horizontal (${ancho}px)`);
  await context.close();
});

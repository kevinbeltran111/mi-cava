// =============================================================================
// 7.4-B4: servidor de PRUEBAS para recorrer «Elegir de mi cava» en Chrome sin
// PostgreSQL. Nunca se usa en producción.
//   /api/que-tomo    → el handler REAL (api/que-tomo.js) sobre el doble en
//                      memoria (supabase_en_memoria.mjs)
//   /rest/v1/*       → lecturas de la app sobre ese mismo estado (subconjunto
//                      mínimo de PostgREST) y rpc/registrar_consumo
//   /auth/v1/user    → el usuario del JWT de prueba
//   resto            → la app compilada (dist)
// La integración con PostgreSQL + PostgREST reales está en
// que_tomo.integracion.test.mjs; este servidor solo sirve para recorrer y
// fotografiar la interfaz.
// =============================================================================
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { crearHandler } from "../../../api/que-tomo.js";
import { motorCellar } from "../../../api/_que-tomo/motor_cellar.js";
import { ENTORNO, USUARIO } from "../supabase_en_memoria.mjs";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS,HEAD", "access-control-expose-headers": "*" };

function leerCuerpo(req) {
  return new Promise((ok) => { const c = []; req.on("data", (x) => c.push(x)); req.on("end", () => ok(Buffer.concat(c).toString())); });
}

function valorDe(fila, k) {
  const m = /^(\w+)->>(\w+)$/.exec(k);
  if (!m) return fila[k];
  const v = fila[m[1]]?.[m[2]];
  return v === undefined || v === null ? null : String(v);
}

// Filtros PostgREST mínimos: col=eq.x | col=is.null.
function filtrar(filas, params) {
  const RESERVADOS = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  return filas.filter((f) => [...params.entries()].every(([k, v]) => {
    if (RESERVADOS.has(k)) return true;
    if (v.startsWith("eq.")) return String(valorDe(f, k) ?? "") === v.slice(3) && valorDe(f, k) !== null;
    if (v === "is.null") return valorDe(f, k) === null || valorDe(f, k) === undefined;
    return true;
  }));
}

export function iniciarServidor({ dist, puerto = 0 }) {
  let base = null;
  const control = { retrasoApiMs: 0, fallasApi: 0, llamadasApi: [] };

  const handlerDe = () => crearHandler({ entorno: ENTORNO, crearCliente: base.crearCliente, motor: motorCellar });

  async function api(req, res) {
    const body = JSON.parse((await leerCuerpo(req)) || "{}");
    control.llamadasApi.push(body);
    if (control.retrasoApiMs) await new Promise((r) => setTimeout(r, control.retrasoApiMs));
    if (control.fallasApi > 0 && !body.accion) {
      control.fallasApi -= 1;
      res.writeHead(503, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Servicio no disponible (falla simulada)", codigo: "contexto_no_disponible" }));
    }
    const r = { codigo: 200, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
    await handlerDe()({ method: "POST", headers: { authorization: req.headers.authorization }, body }, r);
    res.writeHead(r.codigo, { "content-type": "application/json" });
    res.end(JSON.stringify(r.cuerpo));
  }

  async function rest(req, res, url) {
    const [, , , tabla, fn] = url.pathname.split("/"); // /rest/v1/<tabla> | /rest/v1/rpc/<fn>
    const t = base.tablas;
    const enviar = (status, data, objeto = false) => {
      res.writeHead(status, { ...CORS, "content-type": "application/json" });
      res.end(JSON.stringify(objeto ? (data[0] ?? null) : data));
    };
    if (tabla === "rpc" && fn === "registrar_consumo" && req.method === "POST") {
      const { p_wine_id } = JSON.parse((await leerCuerpo(req)) || "{}");
      const priv = t.wine_privado.find((p) => p.wine_id === p_wine_id && p.user_id === USUARIO);
      if (!priv || priv.stock < 1) return enviar(400, { message: "sin stock", code: "P0001" });
      priv.stock -= 1;
      const consumo = { id: crypto.randomUUID(), wine_id: p_wine_id, user_id: USUARIO, fecha: new Date().toISOString(), puntuacion: null, comida: null, comentario: null };
      t.consumos.push(consumo);
      return enviar(200, [{ stock: priv.stock, consumo_id: consumo.id }]);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      await leerCuerpo(req);
      return enviar(201, []);
    }
    const propias = new Set(t.recommendation_sessions.filter((x) => x.user_id === USUARIO).map((x) => x.id));
    let filas = (t[tabla] || []).filter((f) => (tabla === "profiles" ? f.id === USUARIO : tabla === "recommendation_items" ? propias.has(f.session_id) : f.user_id === undefined || f.user_id === USUARIO));
    filas = filtrar(filas, url.searchParams);
    if (tabla === "wines") filas = filas.map((w) => ({ ...w, foto_url: w.foto_url ?? null, profiles: { nombre: "Kevin" }, ratings: [] }));
    if (tabla === "profiles") filas = filas.map((p) => ({ nombre: "Kevin", ...p }));
    const objeto = String(req.headers.accept || "").includes("vnd.pgrst.object");
    return enviar(200, filas, objeto);
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/api/que-tomo" && req.method === "POST") return await api(req, res);
      if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
      if (url.pathname.startsWith("/auth/v1/user")) {
        res.writeHead(200, { ...CORS, "content-type": "application/json" });
        return res.end(JSON.stringify({ id: USUARIO, aud: "authenticated", role: "authenticated", email: "kevin@test.local", app_metadata: {}, user_metadata: {} }));
      }
      if (url.pathname.startsWith("/auth/v1/")) { res.writeHead(204, CORS); return res.end(); }
      const archivo = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
      const real = fs.existsSync(archivo) && fs.statSync(archivo).isFile() ? archivo : path.join(dist, "index.html");
      res.writeHead(200, { "content-type": MIME[path.extname(real)] || "application/octet-stream" });
      fs.createReadStream(real).pipe(res);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  });

  return new Promise((ok) => servidor.listen(puerto, "127.0.0.1", () => ok({
    url: `http://127.0.0.1:${servidor.address().port}`,
    puerto: servidor.address().port,
    usar(b) { base = b; control.llamadasApi.length = 0; control.retrasoApiMs = 0; control.fallasApi = 0; },
    control,
    cerrar: () => new Promise((r) => servidor.close(r)),
  })));
}

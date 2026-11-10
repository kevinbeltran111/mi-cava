// =============================================================================
// Gateway LOCAL de pruebas que imita la URL de un proyecto Supabase para la
// app real (solo pruebas E2E, nunca en producción):
//   /rest/v1/*      → PostgREST local (RLS real)
//   /auth/v1/*      → GoTrue real si GOTRUE_URL está definido (Magic Link
//                     real; las redirecciones se devuelven tal cual).
//                     Sin GOTRUE_URL: /auth/v1/user devuelve el usuario del
//                     JWT de prueba y /auth/v1/logout responde 204.
//   resto           → 404; WebSocket (Realtime) rechazado
// Uso: GW_PORT=... PGRST_URL=http://127.0.0.1:3999 node gateway.mjs
// =============================================================================
import http from "node:http";

const PORT = Number(process.env.GW_PORT || 54399);
const REST = process.env.PGRST_URL || "http://127.0.0.1:3999";
const GOTRUE = process.env.GOTRUE_URL || "";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD",
  "access-control-expose-headers": "*",
};

function usuarioDelJwt(auth) {
  try {
    const p = JSON.parse(Buffer.from(String(auth).split(" ")[1].split(".")[1], "base64url").toString());
    return p.sub ? { id: p.sub, aud: "authenticated", role: "authenticated", email: p.email || `${p.sub}@test.local` } : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  try {
    const destino = req.url.startsWith("/rest/v1")
      ? REST + req.url.slice("/rest/v1".length)
      : GOTRUE && req.url.startsWith("/auth/v1")
        ? GOTRUE + req.url.slice("/auth/v1".length)
        : null;
    if (destino) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"];
      delete headers.origin;
      const r = await fetch(destino, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: "manual",
      });
      const out = { ...CORS };
      r.headers.forEach((v, k) => {
        if (!["content-encoding", "content-length", "access-control-allow-origin"].includes(k)) out[k] = v;
      });
      res.writeHead(r.status, out);
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (req.url.startsWith("/auth/v1/user")) {
      const u = usuarioDelJwt(req.headers.authorization);
      res.writeHead(u ? 200 : 401, { ...CORS, "content-type": "application/json" });
      return res.end(JSON.stringify(u || { message: "invalid token" }));
    }
    if (req.url.startsWith("/auth/v1/logout")) {
      res.writeHead(204, CORS);
      return res.end();
    }
    res.writeHead(404, { ...CORS, "content-type": "application/json" });
    res.end(JSON.stringify({ message: "no disponible en el gateway de pruebas" }));
  } catch (e) {
    res.writeHead(502, { ...CORS, "content-type": "application/json" });
    res.end(JSON.stringify({ message: String(e) }));
  }
});
server.on("upgrade", (_req, socket) => socket.destroy());
server.listen(PORT, "127.0.0.1", () => console.log(`gateway en :${PORT} → ${REST}`));

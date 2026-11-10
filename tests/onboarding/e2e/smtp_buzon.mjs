// =============================================================================
// Buzón SMTP LOCAL para pruebas: acepta todo mensaje (sin TLS ni
// autenticación) y lo guarda como .eml en BUZON_DIR. Solo pruebas.
// Uso: SMTP_PORT=2525 BUZON_DIR=/tmp/buzon node smtp_buzon.mjs
// =============================================================================
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.SMTP_PORT || 2525);
const DIR = process.env.BUZON_DIR || "/tmp/buzon";
fs.mkdirSync(DIR, { recursive: true });
let n = 0;

net
  .createServer((sock) => {
    let buf = "";
    let enData = false;
    let datos = [];
    let destinos = [];
    const r = (l) => sock.write(l + "\r\n");
    r("220 buzon-local ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const linea = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (enData) {
          if (linea === ".") {
            enData = false;
            n += 1;
            const archivo = path.join(DIR, `${Date.now()}-${n}.eml`);
            fs.writeFileSync(archivo, `X-Destinos: ${destinos.join(",")}\r\n` + datos.join("\r\n"));
            datos = [];
            destinos = [];
            r("250 OK guardado");
          } else {
            datos.push(linea.startsWith("..") ? linea.slice(1) : linea);
          }
          continue;
        }
        const cmd = linea.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") r("250 buzon-local");
        else if (cmd === "MAIL") r("250 OK");
        else if (cmd === "RCPT") {
          destinos.push(linea.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, ""));
          r("250 OK");
        } else if (cmd === "DATA") {
          enData = true;
          r("354 Fin con <CRLF>.<CRLF>");
        } else if (cmd === "QUIT") {
          r("221 Chau");
          sock.end();
        } else if (cmd === "RSET" || cmd === "NOOP") r("250 OK");
        else r("250 OK");
      }
    });
    sock.on("error", () => {});
  })
  .listen(PORT, "127.0.0.1", () => console.log(`buzón SMTP en :${PORT} → ${DIR}`));

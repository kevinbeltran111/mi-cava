// Imprime el último link de verificación (Magic Link) recibido en el buzón
// SMTP local de las pruebas. Uso: node ultimo_link.mjs <BUZON_DIR> [email]
import fs from "node:fs";
import path from "node:path";

const [dir, email] = process.argv.slice(2);
if (!dir) {
  console.error("Uso: node ultimo_link.mjs <BUZON_DIR> [email]");
  process.exit(2);
}
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".eml")).sort().reverse();
for (const f of archivos) {
  const raw = fs.readFileSync(path.join(dir, f), "utf8");
  if (email && !raw.split("\r\n")[0].includes(email)) continue;
  const txt = raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const m = txt.match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
  if (m) {
    console.log(m[0].replace(/&amp;/g, "&"));
    process.exit(0);
  }
}
console.error("No hay links en el buzón" + (email ? ` para ${email}` : ""));
process.exit(1);

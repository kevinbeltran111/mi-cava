// UUID v5 (RFC 4122, SHA-1). Ids deterministas para que una misma acción
// repetida caiga sobre la misma fila (reservas 7.4-B3, eventos 7.4-B4).
import crypto from "node:crypto";

export function uuidV5(espacio, nombre) {
  const ns = Buffer.from(String(espacio).replace(/-/g, ""), "hex");
  const h = crypto.createHash("sha1").update(Buffer.concat([ns, Buffer.from(nombre, "utf8")])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

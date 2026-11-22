// 7.3-B: normalización conservadora de variedades y bodegas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarVarietal, resolverAlcanceVariedad, claveBodega, CLASIFICACION } from "../../../api/_que-tomo/conocimiento/normalizacion.js";

const c = (t) => clasificarVarietal(t);

test("monovarietal exacto, con acentos y mayúsculas", () => {
  assert.deepEqual([c("Malbec").estado, c("Malbec").ids, c("Malbec").detalle], ["monovarietal", ["malbec"], "exacta"]);
  assert.deepEqual(c("TORRONTES").ids, ["torrontes"]);
  assert.deepEqual(c("Torrontés").ids, ["torrontes"]);
  assert.deepEqual(c("Pinot Grigio").ids, ["pinot_gris"]); // forma incluida en la etiqueta del catálogo
});

test("monovarietal con texto adicional se marca como tal", () => {
  const r = c("Malbec Reserva");
  assert.equal(r.estado, CLASIFICACION.MONOVARIETAL);
  assert.equal(r.detalle, "con_texto_adicional");
});

test("variedades ambiguas: no se adivina", () => {
  for (const t of ["Cabernet", "Pinot", "Cabernet Malbec", "Sauvignon"]) {
    assert.equal(c(t).estado, CLASIFICACION.AMBIGUA, t);
  }
  assert.deepEqual(c("Cabernet").sinResolver, ["cabernet"]);
});

test("cortes: con separador, sin separador, con marcador y sin componentes", () => {
  assert.deepEqual([c("Malbec - Cabernet Franc").estado, c("Malbec - Cabernet Franc").ids, c("Malbec - Cabernet Franc").detalle], ["corte", ["malbec", "cabernet_franc"], "explicito"]);
  assert.equal(c("Petit Verdot y Malbec").detalle, "explicito");
  assert.equal(c("Malbec Cabernet Franc").detalle, "sin_separador");
  assert.deepEqual([c("Corte de Malbec").estado, c("Corte de Malbec").detalle], ["corte", "componentes_incompletos"]);
  assert.deepEqual([c("Blend").estado, c("Blend").ids], ["corte", []]);
});

test("sin sinónimos ni texto: no reconocida / sin dato", () => {
  assert.equal(c("Shiraz").estado, CLASIFICACION.NO_RECONOCIDA);
  assert.equal(c("").estado, CLASIFICACION.SIN_DATO);
  assert.equal(c(null).estado, CLASIFICACION.SIN_DATO);
});

test("nunca deduce el tipo de vino", () => {
  for (const t of ["Malbec", "Malbec Rosé", "Chardonnay"]) {
    const r = c(t);
    assert.equal("tipo" in r, false);
    assert.equal(JSON.stringify(r).match(/tinto|blanco|rosado|espumoso|naranjo/), null);
  }
});

test("alcance de cepa en user_knowledge: id del catálogo o texto inequívoco", () => {
  assert.deepEqual(resolverAlcanceVariedad("cabernet_franc"), { id: "cabernet_franc", estado: "monovarietal" });
  assert.deepEqual(resolverAlcanceVariedad("Malbec"), { id: "malbec", estado: "monovarietal" });
  assert.equal(resolverAlcanceVariedad("Cabernet").id, null);
  assert.equal(resolverAlcanceVariedad("Malbec Reserva").id, null); // alcance debe ser exacto
});

test("bodegas: solo mayúsculas, acentos, puntuación y espacios", () => {
  assert.equal(claveBodega("  Catena-Zapata. "), "catena zapata");
  assert.equal(claveBodega("Bodega Catena"), "bodega catena"); // no se quitan palabras
  assert.notEqual(claveBodega("Bodega Catena"), claveBodega("Catena"));
  assert.equal(claveBodega(""), null);
});

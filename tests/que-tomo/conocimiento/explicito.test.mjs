// 7.3-B: conocimiento explícito, restricciones persistentes, conocimiento
// sobre vinos y contexto temporal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarConocimiento, aplicaAVino, normalizarAlcance } from "../../../api/_que-tomo/conocimiento/explicito.js";
import { normalizarContextoTemporal } from "../../../api/_que-tomo/conocimiento/temporal.js";
import { extraerEvidencias } from "../../../api/_que-tomo/conocimiento/evidencias.js";
import { contexto, conocimiento } from "./datos.mjs";

const W = "a0000000-0000-0000-0000-0000000b3aaa";

function casos() {
  return contexto({
    vinos: [{ id: W, nombre: "Gran Reserva", varietal: "Malbec", stock: 1 }],
    conocimiento: [
      conocimiento({ id: "no-me-gusta", knowledge_type: "explicit", scope_type: "grape", scope_value: "malbec", meaning: "No me gusta el Malbec", value: { polaridad: "negativa" } }),
      conocimiento({ id: "no-recomendar", knowledge_type: "restriction", scope_type: "grape", scope_value: "malbec", meaning: "No me recomiendes Malbec" }),
      conocimiento({ id: "ocasiones", knowledge_type: "explicit", scope_type: "wine", wine_id: W, wine_snapshot: { nombre: "Gran Reserva" }, meaning: "Lo guardo para ocasiones especiales" }),
    ],
  });
}

test("los cuatro casos se distinguen sin cambiar el esquema", () => {
  const k = clasificarConocimiento(casos());
  // «No me gusta el Malbec»: preferencia explícita, polaridad sin interpretar
  assert.deepEqual(k.preferenciasExplicitas.map((p) => p.id), ["no-me-gusta"]);
  assert.deepEqual(k.preferenciasExplicitas[0].polaridad, { estado: "pendiente_contrato_value", polaridad: null });
  assert.deepEqual(k.preferenciasExplicitas[0].valorRegistrado, { polaridad: "negativa" }); // se conserva, no se interpreta
  // «No me recomiendes Malbec»: restricción persistente, aplicable
  assert.deepEqual(k.restriccionesPersistentes.map((r) => [r.id, r.persistente, r.aplicacion, r.alcance.clave]), [["no-recomendar", true, "automatica", "malbec"]]);
  // «Lo guardo para ocasiones especiales»: conocimiento sobre ESE vino
  assert.deepEqual(k.conocimientoDeVinos.map((c) => [c.id, c.alcance.clave]), [["ocasiones", W]]);
  // «Hoy no quiero Malbec»: temporal, nunca persistente
  const t = normalizarContextoTemporal({ restricciones: [{ alcance: { tipo: "grape", valor: "Malbec" }, texto: "hoy no" }] });
  assert.equal(t.ok, true);
  assert.deepEqual(t.temporal.restricciones.map((r) => [r.alcance.clave, r.persistente]), [["malbec", false]]);
});

test("restricciones que no se aplican automáticamente", () => {
  const ctx = contexto({
    conocimiento: [
      conocimiento({ id: "g", knowledge_type: "restriction", scope_type: "general", meaning: "sin alcohol los días de semana" }),
      conocimiento({ id: "t", knowledge_type: "restriction", scope_type: "wine_type", scope_value: "blanco", meaning: "no blancos" }),
      conocimiento({ id: "c", knowledge_type: "restriction", scope_type: "grape", scope_value: "Cabernet", meaning: "no cabernet" }),
    ],
  });
  const r = Object.fromEntries(clasificarConocimiento(ctx).restriccionesPersistentes.map((x) => [x.id, x.aplicacion]));
  assert.deepEqual(r, { g: "requiere_interpretacion", t: "sin_tipo_en_biblioteca", c: "alcance_no_normalizado" });
});

test("aplicación de una restricción de cepa a vinos: monovarietal, corte, ambiguo", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "m", varietal: "Malbec" },
      { id: "corte", varietal: "Malbec - Syrah" },
      { id: "amb", varietal: "Cabernet" },
      { id: "otro", varietal: "Syrah" },
      { id: "nada", varietal: null },
    ],
  }));
  const malbec = normalizarAlcance({ tipo: "grape", valor: "malbec" });
  const cf = normalizarAlcance({ tipo: "grape", valor: "cabernet_franc" });
  const ap = (a, id) => aplicaAVino(a, ext.vinos.get(id));
  assert.deepEqual(["m", "corte", "amb", "otro", "nada"].map((id) => ap(malbec, id)), ["aplica", "aplica", "no_aplica", "no_aplica", "no_evaluable"]);
  assert.equal(ap(cf, "amb"), "posible"); // «Cabernet» podría ser Cabernet Franc
  assert.equal(ap(normalizarAlcance({ tipo: "wine_type", valor: "tinto" }), "m"), "no_evaluable"); // el tipo no se deduce
});

test("vino borrado: el conocimiento sigue legible por su snapshot", () => {
  const ctx = contexto({ conocimiento: [conocimiento({ id: "x", scope_type: "wine", wine_id: null, wine_snapshot: { nombre: "Borrado" }, meaning: "para el aniversario" })] });
  const k = clasificarConocimiento(ctx).conocimientoDeVinos[0];
  assert.equal(k.alcance.estadoNormalizacion, "vino_eliminado");
  assert.deepEqual(k.alcance.vinoRegistrado, { nombre: "Borrado" });
});

test("contexto temporal: validación, presupuesto de la consulta y nada persistente", () => {
  assert.equal(normalizarContextoTemporal({ restricciones: [{ alcance: { tipo: "general" } }] }).ok, false);
  assert.equal(normalizarContextoTemporal({ comida: 42 }).ok, false);
  assert.equal(normalizarContextoTemporal({ presupuesto: { min: 10, max: 5 } }).ok, false);
  assert.equal(normalizarContextoTemporal({ presupuesto: { max: 5000, moneda: "pesos" } }).ok, false);
  const t = normalizarContextoTemporal({ comida: "  Pescado  ", presupuesto: { max: 20000, moneda: "ARS" } });
  assert.deepEqual(t.temporal, { restricciones: [], comida: "Pescado", presupuesto: { min: null, max: 20000, moneda: "ARS", origen: "consulta" } });
  assert.deepEqual(normalizarContextoTemporal().temporal, { restricciones: [], comida: null, presupuesto: null });
});

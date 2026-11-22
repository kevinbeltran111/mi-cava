// 7.3-B: preparación y simulación de cambios de inferencias. No escribe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { construirConocimiento } from "../../../api/_que-tomo/conocimiento/perfil.js";
import { prepararCambios, prepararRevocacion, validarFila, claveLogica, ESCRITURA_HABILITADA } from "../../../api/_que-tomo/conocimiento/persistencia.js";
import { FORMATO_EVIDENCIA } from "../../../api/_que-tomo/conocimiento/explicar.js";
import { contexto, conocimiento, U, REGLAS_DE_PRUEBA } from "./datos.mjs";

const malbecBueno = [{ id: "w1", varietal: "Malbec", consumos: [{ id: "c1", puntuacion: 4.5 }, { id: "c2", puntuacion: 5 }] }];
const plan = (datos, reglas = REGLAS_DE_PRUEBA) => prepararCambios(construirConocimiento(contexto(datos), { reglas }));
const almacenada = (over) => conocimiento({ knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", source_type: "behavior", strength: "relevant", ...over });

test("escrituras deshabilitadas y sin cliente de base en el módulo", () => {
  assert.equal(ESCRITURA_HABILITADA, false);
  const src = readFileSync(new URL("../../../api/_que-tomo/conocimiento/persistencia.js", import.meta.url), "utf8");
  assert.equal(/supabase|\.from\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(src.replace(/\/\/.*$/gm, "")), false);
});

test("sin reglas validadas: no se propone nada", () => {
  const p = plan({ vinos: malbecBueno }, null);
  assert.deepEqual(p, { estado: "sin_regla_validada", escrituraHabilitada: false, operaciones: [], advertencias: [] });
});

test("insertar: fila válida para 7.1, con evidencia trazable y value pendiente", () => {
  const p = plan({ vinos: malbecBueno });
  assert.equal(p.estado, "simulacion");
  assert.deepEqual(p.operaciones.map((o) => o.op), ["insertar"]);
  const f = p.operaciones[0].fila;
  assert.deepEqual([f.user_id, f.knowledge_type, f.scope_type, f.scope_value, f.strength, f.source_type, f.status, f.value], [U, "inference", "grape", "malbec", "relevant", "behavior", "active", null]);
  assert.equal(f.evidence.formato, FORMATO_EVIDENCIA);
  assert.deepEqual(f.evidence.referencias.map((r) => r.id).sort(), ["c1", "c2"]);
  assert.equal(f.evidence.regla.version, "prueba-no-calibrada");
  assert.deepEqual(validarFila(f), []);
  assert.equal(p.operaciones[0].requiereContratoValue, true);
});

test("sin cambios, actualizar evidencia y sustituir por cambio de nivel", () => {
  const nueva = plan({ vinos: malbecBueno }).operaciones[0].fila;
  // misma polaridad, nivel y referencias → sin cambios
  let p = plan({ vinos: malbecBueno, conocimiento: [almacenada({ id: "k", evidence: nueva.evidence })] });
  assert.deepEqual(p.operaciones.map((o) => o.op), ["sin_cambios"]);
  // mismas polaridad y nivel, otras referencias → actualizar evidencia
  p = plan({ vinos: malbecBueno, conocimiento: [almacenada({ id: "k", evidence: { ...nueva.evidence, referencias: [{ tipo: "consumo", id: "c1", puntuacion: 4.5 }] } })] });
  assert.deepEqual(p.operaciones.map((o) => [o.op, o.id]), [["actualizar", "k"]]);
  // nivel distinto → sustituir (la anterior queda superseded)
  p = plan({ vinos: malbecBueno, conocimiento: [almacenada({ id: "k", strength: "indication", evidence: nueva.evidence })] });
  assert.deepEqual(p.operaciones.map((o) => [o.op, o.id, o.nuevoEstado]), [["sustituir", "k", "superseded"]]);
});

test("retirar cuando la evidencia ya no sostiene la inferencia; duplicadas se advierten", () => {
  let p = plan({ conocimiento: [almacenada({ id: "k", evidence: { consumos: ["borrado"] } })] });
  assert.deepEqual(p.operaciones.map((o) => [o.op, o.id, o.nuevoEstado]), [["retirar", "k", "superseded"]]);
  const nueva = plan({ vinos: malbecBueno }).operaciones[0].fila;
  p = plan({ vinos: malbecBueno, conocimiento: [almacenada({ id: "k1", evidence: nueva.evidence }), almacenada({ id: "k2", evidence: nueva.evidence })] });
  assert.equal(p.advertencias[0].tipo, "duplicadas_activas");
  assert.deepEqual(p.operaciones.map((o) => [o.op, o.id]), [["sin_cambios", "k1"], ["retirar", "k2"]]);
});

test("nunca toca conocimiento explícito, restricciones ni inferencias de otro origen", () => {
  const p = plan({
    vinos: malbecBueno,
    conocimiento: [
      conocimiento({ id: "e", knowledge_type: "explicit", scope_type: "grape", scope_value: "syrah" }),
      conocimiento({ id: "r", knowledge_type: "restriction", scope_type: "grape", scope_value: "syrah" }),
      almacenada({ id: "rec", scope_value: "syrah", source_type: "recommender", evidence: { consumos: ["x"] } }),
    ],
  });
  const ids = p.operaciones.map((o) => o.id).filter(Boolean);
  assert.equal(ids.some((id) => ["e", "r", "rec"].includes(id)), false);
});

test("señales mixtas: no se propone inferencia, se advierte", () => {
  const p = plan({ vinos: [{ varietal: "Malbec", favorito: true, consumos: [{ puntuacion: 1 }] }] });
  assert.deepEqual(p.operaciones, []);
  assert.deepEqual(p.advertencias.map((a) => a.tipo), ["senales_mixtas"]);
});

test("cortes y vinos ambiguos no generan inferencias de cepa", () => {
  const p = plan({ vinos: [{ varietal: "Malbec - Syrah", consumos: [{ puntuacion: 5 }, { puntuacion: 5 }] }, { varietal: "Cabernet", consumos: [{ puntuacion: 5 }, { puntuacion: 5 }] }] });
  assert.deepEqual(p.operaciones, []);
});

test("revocación (corrección del usuario): estado revoked, nunca borrado", () => {
  const { perfil } = construirConocimiento(contexto({ conocimiento: [almacenada({ id: "k", evidence: { consumos: ["c"] } })] }));
  const r = prepararRevocacion(perfil.inferencias.almacenadas[0], "No es así");
  assert.deepEqual(r.operacion, { op: "revocar", id: "k", nuevoEstado: "revoked", motivo: "No es así" });
  assert.equal(prepararRevocacion({ fuente: "conversation" }).ok, false);
});

test("validarFila refleja las restricciones de la migración 7.1", () => {
  const base = { knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", wine_id: null, wine_snapshot: null, meaning: "x", value: null, strength: "indication", source_type: "behavior", evidence: { a: 1 }, status: "active" };
  assert.deepEqual(validarFila(base), []);
  assert.ok(validarFila({ ...base, evidence: {} }).includes("evidence_inference"));
  assert.ok(validarFila({ ...base, strength: "fuerte" }).includes("strength"));
  assert.ok(validarFila({ ...base, scope_type: "wine_type", scope_value: "tintos" }).includes("scope_value"));
  assert.ok(validarFila({ ...base, scope_type: "wine", scope_value: null }).includes("wine_snapshot"));
  assert.ok(validarFila({ ...base, wine_id: "w" }).includes("wine_id"));
  assert.ok(validarFila({ ...base, meaning: "  " }).includes("meaning"));
});

test("clave lógica: una inferencia activa por alcance, sin polaridad", () => {
  assert.equal(claveLogica({ scopeType: "grape", clave: "malbec" }), "inference|behavior|grape|malbec|");
});

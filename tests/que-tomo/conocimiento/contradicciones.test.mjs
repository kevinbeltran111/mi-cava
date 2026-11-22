// 7.3-B: contradicciones y reconstrucción de evidencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirConocimiento } from "../../../api/_que-tomo/conocimiento/perfil.js";
import { reconstruir, leerReferencias, FORMATO_EVIDENCIA } from "../../../api/_que-tomo/conocimiento/explicar.js";
import { contexto, conocimiento, preferencias, REGLAS_DE_PRUEBA } from "./datos.mjs";

const tipos = (lista) => lista.map((c) => `${c.tipo}:${c.estado}:${c.alcance.clave}`).sort();

test("declaración vs restricción persistente: prevalece la restricción", () => {
  const { perfil } = construirConocimiento(contexto({
    preferencias: preferencias({ preferred_grapes: ["malbec"] }),
    conocimiento: [conocimiento({ id: "r", knowledge_type: "restriction", scope_type: "grape", scope_value: "malbec" })],
  }));
  const c = perfil.contradicciones.find((x) => x.tipo === "declaracion_vs_restriccion");
  assert.equal(c.prevalece, "restriccion");
  assert.deepEqual(c.partes.map((p) => p.fuente), ["onboarding", "restriccion"]);
});

test("restricción vs favorito: detectada (monovarietal) y posible (ambiguo)", () => {
  const { perfil } = construirConocimiento(contexto({
    vinos: [{ id: "w1", varietal: "Cabernet Franc", favorito: true }, { id: "w2", varietal: "Cabernet", favorito: true }],
    conocimiento: [conocimiento({ id: "r", knowledge_type: "restriction", scope_type: "grape", scope_value: "cabernet_franc" })],
  }));
  assert.deepEqual(tipos(perfil.contradicciones), ["restriccion_vs_favorito:detectada:cabernet_franc", "restriccion_vs_favorito:posible:cabernet_franc"]);
});

test("inferencia almacenada vs restricción", () => {
  const { perfil } = construirConocimiento(contexto({
    conocimiento: [
      conocimiento({ id: "i", knowledge_type: "inference", scope_type: "grape", scope_value: "syrah", source_type: "behavior", strength: "indication", evidence: { consumos: ["x"] } }),
      conocimiento({ id: "r", knowledge_type: "restriction", scope_type: "grape", scope_value: "syrah" }),
    ],
  }));
  assert.deepEqual(tipos(perfil.contradicciones), ["inferencia_vs_restriccion:detectada:syrah"]);
});

test("explícita sin polaridad interpretable: no evaluable, no se resuelve", () => {
  const { perfil } = construirConocimiento(contexto({
    preferencias: preferencias({ preferred_grapes: ["malbec"] }),
    conocimiento: [conocimiento({ id: "e", knowledge_type: "explicit", scope_type: "grape", scope_value: "malbec", meaning: "No me gusta el Malbec" })],
  }));
  const c = perfil.contradicciones.find((x) => x.tipo === "explicita_no_evaluable");
  assert.equal(c.estado, "no_evaluable");
  assert.equal(c.motivo, "pendiente_contrato_value");
  assert.equal(c.prevalece, null);
});

test("sin reglas no hay contradicciones basadas en puntuaciones", () => {
  const { perfil } = construirConocimiento(contexto({
    preferencias: preferencias({ preferred_grapes: ["malbec"] }),
    vinos: [{ varietal: "Malbec", consumos: [{ puntuacion: 0.5 }, { puntuacion: 1 }] }],
  }));
  assert.deepEqual(perfil.contradicciones, []);
});

test("con reglas (de prueba): señales mixtas y declaración vs afinidad negativa", () => {
  const { perfil } = construirConocimiento(contexto({
    preferencias: preferencias({ preferred_grapes: ["malbec"] }),
    vinos: [{ varietal: "Malbec", favorito: true, consumos: [{ puntuacion: 1 }] }],
  }), { reglas: REGLAS_DE_PRUEBA });
  assert.deepEqual(tipos(perfil.contradicciones), ["declaracion_vs_afinidad_negativa:detectada:malbec", "senales_mixtas:detectada:malbec"]);
});

test("declaraciones sin comportamiento no generan contradicciones", () => {
  const { perfil } = construirConocimiento(contexto({ preferencias: preferencias({ preferred_grapes: ["malbec", "syrah"] }) }));
  assert.deepEqual(perfil.contradicciones, []);
});

// --- reconstrucción ---

function ctxEvidencias() {
  return contexto({
    vinos: [
      { id: "w1", varietal: "Malbec", favorito: false, consumos: [{ id: "c1", puntuacion: 4 }] },
      { id: "w2", varietal: "Syrah", favorito: true },
    ],
  });
}

test("evidencia completa, modificada, obsoleta y faltante", () => {
  const ctx = ctxEvidencias();
  const item = (evidencia) => ({ id: "i", fuente: "behavior", alcance: { tipo: "grape" }, evidenciaRegistrada: evidencia });
  const ev = (refs) => ({ formato: FORMATO_EVIDENCIA, referencias: refs });

  assert.equal(reconstruir(item(ev([{ tipo: "consumo", id: "c1", puntuacion: 4 }, { tipo: "favorito", wineId: "w2" }])), "inference", ctx).estado, "completa");

  const r = reconstruir(item(ev([
    { tipo: "consumo", id: "c1", puntuacion: 5 }, // la puntuación cambió
    { tipo: "favorito", wineId: "w1" }, // ya no es favorito
    { tipo: "consumo", id: "borrado" }, // no existe
  ])), "inference", ctx);
  assert.equal(r.estado, "sin_respaldo_vigente");
  assert.deepEqual(r.referencias.map((x) => x.estado), ["modificada", "obsoleta", "faltante"]);
  assert.deepEqual(r.referencias[0].actual, { puntuacion: 4 });

  const p = reconstruir(item(ev([{ tipo: "consumo", id: "c1", puntuacion: 4 }, { tipo: "vino", wineId: "ajeno-o-borrado" }])), "inference", ctx);
  assert.equal(p.estado, "parcial");
  assert.deepEqual(p.resumen, { vigentes: 1, modificadas: 0, obsoletas: 0, reclasificadas: 0, faltantes: 1 });
});

test("formatos: listas de ids de 7.3-A, no reconocido, sin evidencia", () => {
  assert.equal(leerReferencias({ consumos: ["c1"] }).formato, "listas_de_ids");
  assert.equal(leerReferencias({ cualquier: "cosa" }).formato, "formato_no_reconocido");
  assert.equal(leerReferencias([1, 2]).formato, "formato_no_reconocido");
  const ctx = ctxEvidencias();
  assert.equal(reconstruir({ id: "e", evidenciaRegistrada: null }, "explicit", ctx).estado, "declarado_por_usuario");
  assert.equal(reconstruir({ id: "i", evidenciaRegistrada: { x: 1 } }, "inference", ctx).estado, "formato_no_reconocido");
  assert.equal(reconstruir({ id: "i", evidenciaRegistrada: { formato: FORMATO_EVIDENCIA, referencias: [] } }, "inference", ctx).estado, "sin_evidencia");
});

test("vino objetivo borrado: se informa con su snapshot", () => {
  const r = reconstruir({ id: "k", alcance: { tipo: "wine", clave: null, vinoRegistrado: { nombre: "Ya no está" } }, evidenciaRegistrada: null }, "explicit", ctxEvidencias());
  assert.deepEqual(r.vinoObjetivo, { estado: "eliminado", wineId: null, registrado: { nombre: "Ya no está" } });
});

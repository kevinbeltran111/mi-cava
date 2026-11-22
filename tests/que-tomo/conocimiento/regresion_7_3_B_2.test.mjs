// 7.3-B (segunda revisión): regresiones de
//   1. validación de restricciones temporales y coincidencias inciertas;
//   2. cortes con componentes no reconocidos;
//   3. vigencia de evidencias ante cambios de clasificación.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarContextoTemporal } from "../../../api/_que-tomo/conocimiento/temporal.js";
import { clasificarVarietal, CLASIFICACION } from "../../../api/_que-tomo/conocimiento/normalizacion.js";
import { extraerEvidencias } from "../../../api/_que-tomo/conocimiento/evidencias.js";
import { agregarPorCepa } from "../../../api/_que-tomo/conocimiento/agregacion.js";
import { aplicaAVino, normalizarAlcance } from "../../../api/_que-tomo/conocimiento/explicito.js";
import { construirConocimiento } from "../../../api/_que-tomo/conocimiento/perfil.js";
import { seleccionarParaConsulta } from "../../../api/_que-tomo/conocimiento/seleccion.js";
import { prepararCambios } from "../../../api/_que-tomo/conocimiento/persistencia.js";
import { reconstruir, FORMATO_EVIDENCIA } from "../../../api/_que-tomo/conocimiento/explicar.js";
import { contexto, conocimiento, REGLAS_DE_PRUEBA, REGLAS_DE_PRUEBA_BODEGA } from "./datos.mjs";

// ---------------------------------------------------------------------------
// 1. Restricciones temporales
// ---------------------------------------------------------------------------

const err = (entrada) => {
  const r = normalizarContextoTemporal(entrada);
  assert.equal(r.ok, false, JSON.stringify(entrada));
  assert.deepEqual(r.temporal.restricciones, []);
  return r.errores.join(" ");
};

test("1. `restricciones` debe ser un arreglo cuando se suministra", () => {
  for (const v of ["malbec", { alcance: { tipo: "grape", valor: "malbec" } }, 3, true]) {
    assert.match(err({ restricciones: v }), /lista/);
  }
  assert.equal(normalizarContextoTemporal({ restricciones: null }).ok, true);
  assert.equal(normalizarContextoTemporal({ restricciones: [] }).ok, true);
});

test("1. entradas malformadas: error controlado, sin excepciones", () => {
  for (const r of [null, 5, "malbec", [], {}, { alcance: null }, { alcance: "grape" }, { alcance: [] }, { alcance: { tipo: "otro", valor: "x" } }, { alcance: { tipo: "grape", valor: "malbec" }, texto: 7 }]) {
    assert.doesNotThrow(() => normalizarContextoTemporal({ restricciones: [r] }));
    err({ restricciones: [r] });
  }
});

test("1. cepa ausente, ambigua, desconocida o con texto adicional: error de validación", () => {
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape" } }] }), /falta el valor/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape", valor: "  " } }] }), /falta el valor/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape", valor: "Cabernet" } }] }), /no resoluble \(ambigua\)/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape", valor: "Shiraz" } }] }), /no resoluble \(no_reconocida\)/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape", valor: "Malbec Reserva" } }] }), /no resoluble/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "grape", valor: "Malbec / Shiraz" } }] }), /no resoluble \(corte\)/);
});

test("1. otros alcances: vino, bodega y tipo deben resolverse", () => {
  assert.match(err({ restricciones: [{ alcance: { tipo: "wine" } }] }), /falta el vino/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "winery", valor: "" } }] }), /falta el valor/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "winery", valor: "--" } }] }), /no resoluble/);
  assert.match(err({ restricciones: [{ alcance: { tipo: "wine_type", valor: "tintos" } }] }), /tipo de vino/);
  // una entrada inválida invalida toda la consulta, aunque otras sean válidas
  const r = normalizarContextoTemporal({ restricciones: [{ alcance: { tipo: "grape", valor: "malbec" } }, { alcance: { tipo: "grape", valor: "Pinot" } }] });
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /Restricción temporal 2/);
});

test("1. entradas válidas se normalizan", () => {
  const r = normalizarContextoTemporal({ restricciones: [
    { alcance: { tipo: "grape", valor: "Malbec" } },
    { alcance: { tipo: "grape", valor: "cabernet_franc" } },
    { alcance: { tipo: "winery", valor: "Bodega A" } },
    { alcance: { tipo: "wine", wineId: "w1" } },
    { alcance: { tipo: "wine_type", valor: "blanco" } },
  ] });
  assert.equal(r.ok, true, r.errores.join());
  assert.deepEqual(r.temporal.restricciones.map((x) => x.alcance.clave), ["malbec", "cabernet_franc", "bodega a", "w1", "blanco"]);
});

test("1. selección: la consulta con restricción inválida se rechaza", () => {
  const ctx = contexto({ vinos: [{ varietal: "Malbec", stock: 1 }] });
  const k = construirConocimiento(ctx);
  const r = seleccionarParaConsulta({ contexto: ctx, ...k }, { modo: "cellar", temporal: { restricciones: [{ alcance: { tipo: "grape", valor: "Cabernet" } }] } });
  assert.equal(r.ok, false);
  assert.equal(r.error.tipo, "validacion");
});

test("1. selección: confirmadas se excluyen; posibles y no evaluables se conservan y se señalan", () => {
  const ctx = contexto({
    vinos: [
      { id: "mono", varietal: "Syrah", stock: 1 },
      { id: "incompleto", varietal: "Malbec / Shiraz", stock: 1 },
      { id: "ambiguo", varietal: "Cabernet", stock: 1 },
      { id: "sindato", varietal: null, stock: 1 },
      { id: "completo", varietal: "Malbec - Cabernet Franc", stock: 1 },
      { id: "otro", varietal: "Torrontés", stock: 1 },
    ],
    conocimiento: [conocimiento({ id: "r-cf", knowledge_type: "restriction", scope_type: "grape", scope_value: "cabernet_franc" })],
  });
  const k = construirConocimiento(ctx);
  const s = seleccionarParaConsulta({ contexto: ctx, ...k }, { modo: "cellar", temporal: { restricciones: [{ alcance: { tipo: "grape", valor: "syrah" } }] } }).seleccion;

  // Confirmadas: Syrah (temporal) y el corte completo con Cabernet Franc (persistente).
  assert.deepEqual(s.excluidos.map((x) => [x.wineId, x.motivos.map((m) => `${m.origen}:${m.coincidencia}`)]).sort(), [
    ["completo", ["persistente:confirmada"]],
    ["mono", ["temporal:confirmada"]],
  ]);
  // Conservados con incertidumbre explícita.
  const inc = Object.fromEntries(["incompleto", "ambiguo", "sindato"].map((id) => [id, s.inciertos.filter((x) => x.wineId === id).map((x) => `${x.origen}:${x.coincidencia}`).sort()]));
  assert.deepEqual(inc, {
    incompleto: ["persistente:posible", "temporal:posible"], // «Shiraz» desconocido podría ser cualquiera
    ambiguo: ["persistente:posible"], // «Cabernet» podría ser Cabernet Franc; no es Syrah
    sindato: ["persistente:no_evaluable", "temporal:no_evaluable"],
  });
  assert.deepEqual(s.candidatos.map((c) => c.wineId).sort(), ["ambiguo", "incompleto", "otro", "sindato"]);
  assert.deepEqual(s.candidatos.find((c) => c.wineId === "otro").coincidenciasInciertas, []);
  assert.equal(s.candidatos.find((c) => c.wineId === "ambiguo").coincidenciasInciertas[0].alcance.clave, "cabernet_franc");
});

test("1. selección: una restricción general queda no evaluable en cada candidato", () => {
  const ctx = contexto({
    vinos: [{ id: "a", varietal: "Malbec", stock: 1 }],
    conocimiento: [conocimiento({ id: "g", knowledge_type: "restriction", scope_type: "general", meaning: "sin alcohol los días de semana" })],
  });
  const k = construirConocimiento(ctx);
  const s = seleccionarParaConsulta({ contexto: ctx, ...k }, { modo: "cellar" }).seleccion;
  assert.deepEqual(s.excluidos, []);
  assert.deepEqual(s.inciertos.map((x) => [x.wineId, x.restriccion, x.coincidencia]), [["a", "g", "no_evaluable"]]);
});

// ---------------------------------------------------------------------------
// 2. Cortes con componentes no reconocidos
// ---------------------------------------------------------------------------

test("2. «Malbec / Shiraz» es un corte incompleto, no Malbec monovarietal", () => {
  const c = clasificarVarietal("Malbec / Shiraz");
  assert.equal(c.estado, CLASIFICACION.CORTE);
  assert.deepEqual(c.ids, ["malbec"]);
  assert.equal(c.detalle, "componentes_incompletos");
  assert.deepEqual(c.noReconocido, ["shiraz"]);
  for (const t of ["Malbec - Shiraz", "Malbec + Shiraz", "Malbec y Shiraz", "Malbec, Shiraz", "Malbec - Cabernet Franc - Shiraz"]) {
    assert.equal(clasificarVarietal(t).detalle, "componentes_incompletos", t);
  }
});

test("2. sin regresiones: monovarietales y cortes completos se mantienen", () => {
  assert.deepEqual([clasificarVarietal("Pinot Gris / Pinot Grigio").estado, clasificarVarietal("Pinot Gris / Pinot Grigio").ids], ["monovarietal", ["pinot_gris"]]);
  assert.equal(clasificarVarietal("Cabernet-Sauvignon").estado, "monovarietal");
  assert.equal(clasificarVarietal("Malbec Reserva").detalle, "con_texto_adicional"); // límite documentado
  assert.equal(clasificarVarietal("Corte de Malbec y Syrah").detalle, "explicito");
  assert.equal(clasificarVarietal("Malbec - Cabernet Franc").detalle, "explicito");
  assert.equal(clasificarVarietal("Shiraz").estado, "no_reconocida"); // catálogo sin sinónimos
});

test("2. la evidencia del corte incompleto no entra en el bloque monovarietal", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "m", varietal: "Malbec", consumos: [{ id: "c-m", puntuacion: 4 }] },
      { id: "ms", varietal: "Malbec / Shiraz", favorito: true, consumos: [{ id: "c-ms", puntuacion: 5 }] },
    ],
  }));
  const g = agregarPorCepa(ext).grupos.find((x) => x.clave === "malbec");
  assert.deepEqual(g.evidencias.monovarietal, ["consumo:c-m"]);
  assert.deepEqual(g.evidencias.enCorte, ["consumo:c-ms", "favorito:ms"]);
  assert.deepEqual([g.bloques.monovarietal.vinosEnBiblioteca, g.bloques.monovarietal.favoritos, g.bloques.monovarietal.puntuacion.max], [1, 0, 4]);
});

test("2. aplicación de restricciones a cortes: incompleto = posible, completo = no aplica", () => {
  const ext = extraerEvidencias(contexto({ vinos: [{ id: "inc", varietal: "Malbec / Shiraz" }, { id: "comp", varietal: "Malbec - Cabernet Franc" }] }));
  const syrah = normalizarAlcance({ tipo: "grape", valor: "syrah" });
  const malbec = normalizarAlcance({ tipo: "grape", valor: "malbec" });
  assert.equal(aplicaAVino(syrah, ext.vinos.get("inc")), "posible");
  assert.equal(aplicaAVino(syrah, ext.vinos.get("comp")), "no_aplica");
  assert.equal(aplicaAVino(malbec, ext.vinos.get("inc")), "aplica");
});

// ---------------------------------------------------------------------------
// 3. Vigencia de evidencias ante cambios de clasificación
// ---------------------------------------------------------------------------

// Evidencia generada por la simulación de persistencia con el varietal
// original; después se reconstruye contra el vino reclasificado.
function evidenciaSimulada(varietal, extra = {}) {
  const datos = { vinos: [{ id: "w1", varietal, bodega: "Bodega A", favorito: true, consumos: [{ id: "c1", puntuacion: 4.5 }, { id: "c2", puntuacion: 5 }] }], ...extra };
  const op = prepararCambios(construirConocimiento(contexto(datos), { reglas: REGLAS_DE_PRUEBA })).operaciones.find((o) => o.op === "insertar");
  return op.fila;
}

const inferencia = (fila) => conocimiento({ id: "inf", knowledge_type: "inference", scope_type: fila.scope_type, scope_value: fila.scope_value, source_type: "behavior", strength: fila.strength, evidence: fila.evidence });
const explicacion = (ctx) => construirConocimiento(ctx).perfil.inferencias.almacenadas.find((i) => i.id === "inf").explicacion;

test("3. la evidencia simulada guarda la clasificación de cada referencia", () => {
  const fila = evidenciaSimulada("Malbec");
  assert.ok(fila.evidence.referencias.length > 0);
  for (const r of fila.evidence.referencias) {
    assert.deepEqual([r.clasificacion.dimension, r.clasificacion.rol, r.clasificacion.detalle.estado, r.clasificacion.detalle.ids], ["grape", "monovarietal", "monovarietal", ["malbec"]]);
  }
});

test("3. sin cambios en el vino: completa, con respaldo que coincide", () => {
  const fila = evidenciaSimulada("Malbec");
  const e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Malbec", bodega: "Bodega A", favorito: true, consumos: [{ id: "c1", puntuacion: 4.5 }, { id: "c2", puntuacion: 5 }] }], conocimiento: [inferencia(fila)] }));
  assert.equal(e.estado, "completa");
  assert.ok(e.referencias.every((r) => r.respaldoAlcance.verificacion === "coincide"));
  assert.deepEqual(e.limites, []);
});

test("3. el vino cambia de varietal con el mismo puntaje: la referencia queda reclasificada", () => {
  const fila = evidenciaSimulada("Malbec");
  const casos = { "Syrah": null, "Malbec / Shiraz": "enCorte", "Cabernet": null };
  for (const [nuevo, rolActual] of Object.entries(casos)) {
    const e = explicacion(contexto({ vinos: [{ id: "w1", varietal: nuevo, bodega: "Bodega A", favorito: true, consumos: [{ id: "c1", puntuacion: 4.5 }, { id: "c2", puntuacion: 5 }] }], conocimiento: [inferencia(fila)] }));
    assert.equal(e.estado, "sin_respaldo_vigente", nuevo);
    assert.ok(e.referencias.every((r) => r.estado === "reclasificada"), nuevo);
    assert.ok(e.referencias.every((r) => r.respaldoAlcance.verificacion === "cambio" && r.respaldoAlcance.rolRegistrado === "monovarietal" && r.respaldoAlcance.rolActual === rolActual), nuevo);
    assert.equal(e.resumen.reclasificadas, e.referencias.length);
  }
});

test("3. inferencia por bodega: cambiar la bodega reclasifica aunque siga favorito", () => {
  const datos = { vinos: [{ id: "w1", varietal: "Malbec", bodega: "Bodega A", favorito: true }] };
  const fila = prepararCambios(construirConocimiento(contexto(datos), { reglas: REGLAS_DE_PRUEBA_BODEGA })).operaciones.find((o) => o.op === "insertar").fila;
  assert.equal(fila.scope_type, "winery");
  let e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Malbec", bodega: "BODEGA A.", favorito: true }], conocimiento: [inferencia(fila)] }));
  assert.equal(e.estado, "completa"); // misma clave normalizada
  e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Malbec", bodega: "Bodega B", favorito: true }], conocimiento: [inferencia(fila)] }));
  assert.deepEqual(e.referencias.map((r) => [r.estado, r.respaldoAlcance.rolActual]), [["reclasificada", null]]);
});

test("3. una referencia modificada conserva su estado e informa el respaldo", () => {
  const fila = evidenciaSimulada("Malbec");
  const e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Syrah", bodega: "Bodega A", favorito: true, consumos: [{ id: "c1", puntuacion: 2 }, { id: "c2", puntuacion: 5 }] }], conocimiento: [inferencia(fila)] }));
  const c1 = e.referencias.find((r) => r.id === "c1");
  assert.equal(c1.estado, "modificada");
  assert.equal(c1.respaldoAlcance.verificacion, "cambio");
});

test("3. referencias antiguas solo con ids: límite explícito del respaldo original", () => {
  const legacy = conocimiento({ id: "inf", knowledge_type: "inference", scope_type: "grape", scope_value: "malbec", source_type: "behavior", strength: "indication", evidence: { consumos: ["c1"] } });
  // hoy el vino sigue siendo Malbec: vigente, pero el respaldo original no se puede verificar
  let e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Malbec", consumos: [{ id: "c1", puntuacion: 4 }] }], conocimiento: [legacy] }));
  assert.equal(e.estado, "completa");
  assert.equal(e.referencias[0].respaldoAlcance.verificacion, "sin_clasificacion_registrada");
  assert.equal(e.referencias[0].respaldoAlcance.rolActual, "monovarietal");
  assert.deepEqual(e.limites.map((l) => l.tipo), ["respaldo_original_no_verificable"]);
  // hoy el vino ya no es Malbec: no respalda el alcance
  e = explicacion(contexto({ vinos: [{ id: "w1", varietal: "Syrah", consumos: [{ id: "c1", puntuacion: 4 }] }], conocimiento: [legacy] }));
  assert.equal(e.referencias[0].estado, "reclasificada");
  assert.equal(e.estado, "sin_respaldo_vigente");
  assert.deepEqual(e.limites.map((l) => l.tipo), ["respaldo_original_no_verificable"]);
});

test("3. inferencias de vino o con alcance no normalizable: sin verificación de alcance", () => {
  const ctx = contexto({ vinos: [{ id: "w1", varietal: "Malbec", consumos: [{ id: "c1", puntuacion: 4 }] }] });
  const r1 = reconstruir({ id: "x", alcance: { tipo: "wine", clave: "w1" }, evidenciaRegistrada: { consumos: ["c1"] } }, "inference", ctx);
  assert.equal(r1.referencias[0].respaldoAlcance.verificacion, "no_aplica");
  assert.equal(r1.estado, "completa");
  const r2 = reconstruir({ id: "y", alcance: { tipo: "grape", clave: null, valor: "Cabernet" }, evidenciaRegistrada: { consumos: ["c1"] } }, "inference", ctx);
  assert.deepEqual(r2.limites.map((l) => l.tipo), ["alcance_no_verificable"]);
  // formato 7.3-B con agregación registrada pero sin clasificación por referencia: usa el rol de la agregación
  const r3 = reconstruir({ id: "z", alcance: { tipo: "grape", clave: "malbec" }, evidenciaRegistrada: { formato: FORMATO_EVIDENCIA, agregacion: { dimension: "grape", clave: "malbec", rol: "enCorte" }, referencias: [{ tipo: "consumo", id: "c1", puntuacion: 4 }] } }, "inference", ctx);
  assert.deepEqual([r3.referencias[0].estado, r3.referencias[0].respaldoAlcance.verificacion], ["reclasificada", "cambio"]);
});

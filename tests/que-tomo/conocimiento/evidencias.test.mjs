// 7.3-B: evidencias individuales y agregaciones por cepa y bodega.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerEvidencias, TIPOS_EVIDENCIA, TIPOS_RESERVADOS } from "../../../api/_que-tomo/conocimiento/evidencias.js";
import { agregarPorCepa, agregarPorBodega } from "../../../api/_que-tomo/conocimiento/agregacion.js";
import { contexto } from "./datos.mjs";

const grupo = (agr, clave) => agr.grupos.find((g) => g.clave === clave);

test("usuario nuevo sin historial: sin evidencias ni grupos", () => {
  const ext = extraerEvidencias(contexto());
  assert.equal(ext.evidencias.length, 0);
  assert.deepEqual(agregarPorCepa(ext), { grupos: [], sinClasificar: [] });
  assert.deepEqual(agregarPorBodega(ext), { grupos: [], sinClasificar: [] });
});

test("stock, alta, precio y maridaje no generan evidencia", () => {
  const ext = extraerEvidencias(contexto({ vinos: [{ varietal: "Malbec", bodega: "B", stock: 12, precio: 99999, maridaje: "Asado" }] }));
  assert.equal(ext.evidencias.length, 0);
  const g = grupo(agregarPorCepa(ext), "malbec");
  assert.equal(g.bloques.monovarietal.vinosEnBiblioteca, 1); // exposición
  assert.equal(g.bloques.monovarietal.vinosConEvidencia, 0);
});

test("favorito y experiencias puntuadas son evidencias trazables", () => {
  const ext = extraerEvidencias(contexto({ vinos: [{ id: "w1", varietal: "Malbec", favorito: true, consumos: [{ id: "c1", puntuacion: 4.5, comida: "Asado", comentario: "rico" }] }] }));
  assert.deepEqual(ext.evidencias.map((e) => [e.id, e.tipo]), [["favorito:w1", "favorito"], ["consumo:c1", "experiencia_puntuada"]]);
  const exp = ext.evidencias[1];
  assert.deepEqual(exp.origen, { tabla: "consumos", id: "c1" });
  assert.equal(exp.puntuacion, 4.5); // se conserva tal cual, sin clasificar
  assert.equal("polaridad" in exp, false);
  assert.equal("comentario" in exp, false); // el texto no viaja en la evidencia
});

test("consumo sin puntuación: frecuencia, no satisfacción", () => {
  const ext = extraerEvidencias(contexto({ vinos: [{ varietal: "Malbec", consumos: [{ puntuacion: null }, { puntuacion: null }] }] }));
  assert.ok(ext.evidencias.every((e) => e.tipo === TIPOS_EVIDENCIA.CONSUMO_SIN_PUNTUAR && e.puntuacion === null));
  const b = grupo(agregarPorCepa(ext), "malbec").bloques.monovarietal;
  assert.deepEqual([b.consumosSinPuntuar, b.experienciasPuntuadas, b.puntuacion.n, b.puntuacion.promedio], [2, 0, 0, null]);
});

test("ratings históricos no se incorporan", () => {
  const ext = extraerEvidencias(contexto({ vinos: [{ varietal: "Malbec", favorito: true }] }));
  assert.equal(ext.evidencias.some((e) => e.tipo === TIPOS_RESERVADOS.RATING_HISTORICO), false);
});

test("agregación por cepa: sin duplicar experiencias y con indicadores", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "w1", varietal: "Malbec", favorito: true, consumos: [{ id: "c1", puntuacion: 4, fecha: "2026-10-01T20:00:00Z" }, { id: "c2", puntuacion: 5, fecha: "2026-10-01T23:00:00Z" }] },
      { id: "w2", varietal: "malbec reserva", consumos: [{ id: "c3", puntuacion: 3, fecha: "2026-11-02T20:00:00Z" }] },
    ],
  }));
  const g = grupo(agregarPorCepa(ext), "malbec");
  const b = g.bloques.monovarietal;
  assert.deepEqual(g.evidencias.monovarietal, ["consumo:c1", "consumo:c2", "consumo:c3", "favorito:w1"]);
  assert.deepEqual([b.vinosEnBiblioteca, b.vinosConEvidencia, b.favoritos, b.experienciasPuntuadas, b.consumosTotales, b.diasConConsumo], [2, 2, 1, 3, 3, 2]);
  assert.deepEqual([b.puntuacion.n, b.puntuacion.promedio, b.puntuacion.min, b.puntuacion.max], [3, 4, 3, 5]);
  assert.deepEqual(b.puntuacion.distribucion, { 3: 1, 4: 1, 5: 1 });
  assert.equal(b.primeraFecha, "2026-10-01T20:00:00Z");
  assert.equal(b.ultimaFecha, "2026-11-02T20:00:00Z");
});

test("cortes: aportan a 'enCorte', nunca a 'monovarietal'", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "w1", varietal: "Malbec", consumos: [{ id: "c1", puntuacion: 4 }] },
      { id: "w2", varietal: "Malbec - Cabernet Franc", favorito: true, consumos: [{ id: "c2", puntuacion: 5 }] },
    ],
  }));
  const agr = agregarPorCepa(ext);
  const m = grupo(agr, "malbec");
  assert.deepEqual(m.evidencias.monovarietal, ["consumo:c1"]);
  assert.deepEqual(m.evidencias.enCorte, ["consumo:c2", "favorito:w2"]);
  assert.equal(m.bloques.monovarietal.favoritos, 0);
  assert.equal(grupo(agr, "cabernet_franc").bloques.monovarietal.vinosEnBiblioteca, 0);
  assert.equal(grupo(agr, "cabernet_franc").bloques.enCorte.favoritos, 1);
});

test("ambiguas, no reconocidas y sin dato quedan sin clasificar, con sus evidencias", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "w1", varietal: "Cabernet", favorito: true },
      { id: "w2", varietal: "Shiraz", consumos: [{ id: "c1", puntuacion: 5 }] },
      { id: "w3", varietal: null },
      { id: "w4", varietal: "Blend" },
    ],
  }));
  const agr = agregarPorCepa(ext);
  assert.equal(agr.grupos.length, 0);
  assert.deepEqual(agr.sinClasificar.map((s) => [s.wineId, s.motivo, s.evidencias]).sort(), [
    ["w1", "ambigua", ["favorito:w1"]],
    ["w2", "no_reconocida", ["consumo:c1"]],
    ["w3", "sin_dato", []],
    ["w4", "corte_sin_componentes", []],
  ]);
});

test("agregación por bodega: clave normalizada; sin bodega → sin clasificar", () => {
  const ext = extraerEvidencias(contexto({
    vinos: [
      { id: "w1", bodega: "Catena Zapata", consumos: [{ id: "c1", puntuacion: 4 }] },
      { id: "w2", bodega: "CATENA-ZAPATA", favorito: true },
      { id: "w3", bodega: null, favorito: true },
    ],
  }));
  const agr = agregarPorBodega(ext);
  assert.deepEqual(agr.grupos.map((g) => [g.clave, g.bloques.total.vinosConEvidencia]), [["catena zapata", 2]]);
  assert.deepEqual(agr.sinClasificar.map((s) => [s.wineId, s.motivo]), [["w3", "sin_bodega"]]);
});

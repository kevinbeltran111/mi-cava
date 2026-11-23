// 7.4-B2: refinamiento por variedad — contrato de entrada y filtros (puro).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarRefinamiento, filtrosDeSesion, acumularFiltro, temporalDeFiltros, contextoDeSesion, describirFiltros, revisionDe,
} from "../../api/_que-tomo/refinamiento.js";
import { normalizarContextoTemporal } from "../../api/_que-tomo/conocimiento/temporal.js";

const SID = "5b37f15f-a34b-4dce-a59b-397066b7f23d";

test("sin sesionId ni restricción: consulta nueva", () => {
  assert.deepEqual(validarRefinamiento({ modo: "cellar" }), { ok: true, refinamiento: null });
  assert.deepEqual(validarRefinamiento({ modo: "cellar", sesionId: null, restriccion: null }), { ok: true, refinamiento: null });
});

test("refinamiento válido: etiqueta o id del catálogo → misma clave", () => {
  for (const valor of ["Malbec", "malbec", " MALBEC "]) {
    const r = validarRefinamiento({ sesionId: SID, restriccion: { alcance: { tipo: "grape", valor } } });
    assert.deepEqual(r, { ok: true, refinamiento: { sesionId: SID, filtro: { tipo: "grape", clave: "malbec" } } }, valor);
  }
  const cf = validarRefinamiento({ sesionId: SID.toUpperCase(), restriccion: { alcance: { tipo: "grape", valor: "cabernet_franc" } } });
  assert.deepEqual(cf.refinamiento, { sesionId: SID, filtro: { tipo: "grape", clave: "cabernet_franc" } });
});

test("entradas inválidas con su código", () => {
  const casos = [
    [{ restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, "sesion_requerida"],
    [{ sesionId: "abc", restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, "sesion_invalida"],
    [{ sesionId: 42, restriccion: { alcance: { tipo: "grape", valor: "Malbec" } } }, "sesion_invalida"],
    [{ sesionId: SID }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: "Malbec" }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: [{ alcance: { tipo: "grape", valor: "Malbec" } }] }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "winery", valor: "Catena" } } }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "wine", wineId: SID } } }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "grape", valor: "Cabernet" } } }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "grape", valor: "Shiraz" } } }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "grape", valor: "" } } }, "restriccion_invalida"],
    [{ sesionId: SID, restriccion: { alcance: { tipo: "grape" } } }, "restriccion_invalida"],
  ];
  for (const [body, codigo] of casos) {
    const r = validarRefinamiento(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.codigo, codigo, JSON.stringify(body));
  }
});

test("filtros: acumulan sin duplicar, en orden de llegada; contexto viejo = sin filtros", () => {
  const m = { tipo: "grape", clave: "malbec" };
  const s = { tipo: "grape", clave: "syrah" };
  assert.deepEqual(acumularFiltro(acumularFiltro(acumularFiltro([], m), s), m), [m, s]);
  assert.deepEqual(filtrosDeSesion({ entrada: "elegir_de_mi_cava", tanda: 1 }), []);
  assert.deepEqual(filtrosDeSesion(null), []);
  assert.deepEqual(filtrosDeSesion({ temporal: { restricciones: [m, { tipo: "winery", clave: "x" }, null] } }), [m]);
  assert.equal(revisionDe({ tanda: 1 }), null);
  assert.equal(revisionDe({ revision: 4 }), 4);
});

test("contexto de sesión y entrada temporal reutilizan normalizarContextoTemporal (7.3-B)", () => {
  const filtros = [{ tipo: "grape", clave: "malbec" }, { tipo: "grape", clave: "cabernet_franc" }];
  const ctx = contextoDeSesion({ entrada: "elegir_de_mi_cava", tanda: 1, revision: 1 }, { tanda: 2, revision: 2, filtros });
  assert.deepEqual(ctx, { entrada: "elegir_de_mi_cava", tanda: 2, revision: 2, temporal: { restricciones: filtros } });
  const t = normalizarContextoTemporal(temporalDeFiltros(filtrosDeSesion(ctx)));
  assert.equal(t.ok, true);
  assert.deepEqual(t.temporal.restricciones.map((r) => [r.alcance.clave, r.persistente]), [["malbec", false], ["cabernet_franc", false]]);
  assert.deepEqual(describirFiltros(filtros), [
    { tipo: "grape", clave: "malbec", etiqueta: "Malbec" },
    { tipo: "grape", clave: "cabernet_franc", etiqueta: "Cabernet Franc" },
  ]);
});

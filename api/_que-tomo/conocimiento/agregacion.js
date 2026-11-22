// =============================================================================
// Etapa 7.3-B: agregaciones por cepa y por bodega.
// =============================================================================
// Agrupa evidencias SIN concluir nada: produce indicadores para una
// calibración posterior. No hay umbrales ni polaridad.
//
// Reglas:
//   * cada evidencia se cuenta una sola vez por grupo (id único);
//   * cepa: solo vinos clasificados 'monovarietal' aportan al bloque
//     `monovarietal`. Los componentes de un 'corte' aportan a `enCorte`,
//     separado. Ambiguos, no reconocidos y sin dato no se asignan a ninguna
//     cepa: quedan en `sinClasificar`;
//   * bodega: por clave normalizada; vinos sin bodega quedan en
//     `sinClasificar`;
//   * `vinosEnBiblioteca` es exposición (hecho), no evidencia de gusto.
// =============================================================================

import { CLASIFICACION, etiquetaDeVariedad } from "./normalizacion.js";
import { TIPOS_EVIDENCIA } from "./evidencias.js";

function diaDe(fecha) {
  const t = Date.parse(fecha);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function indicadoresVacios() {
  return {
    vinosEnBiblioteca: 0,
    vinosConEvidencia: 0,
    favoritos: 0,
    experienciasPuntuadas: 0,
    consumosSinPuntuar: 0,
    consumosTotales: 0,
    diasConConsumo: 0,
    puntuacion: { n: 0, promedio: null, min: null, max: null, distribucion: {} },
    primeraFecha: null,
    ultimaFecha: null,
  };
}

function calcularIndicadores(vinoIds, evidencias) {
  const ind = indicadoresVacios();
  ind.vinosEnBiblioteca = vinoIds.size;
  const conEvidencia = new Set();
  const dias = new Set();
  const puntajes = [];
  for (const e of evidencias) {
    conEvidencia.add(e.wineId);
    if (e.tipo === TIPOS_EVIDENCIA.FAVORITO) ind.favoritos += 1;
    if (e.tipo === TIPOS_EVIDENCIA.EXPERIENCIA_PUNTUADA) {
      ind.experienciasPuntuadas += 1;
      puntajes.push(Number(e.puntuacion));
    }
    if (e.tipo === TIPOS_EVIDENCIA.CONSUMO_SIN_PUNTUAR) ind.consumosSinPuntuar += 1;
    if (e.consumoId) {
      ind.consumosTotales += 1;
      const d = diaDe(e.fecha);
      if (d) dias.add(d);
      if (e.fecha && (!ind.primeraFecha || e.fecha < ind.primeraFecha)) ind.primeraFecha = e.fecha;
      if (e.fecha && (!ind.ultimaFecha || e.fecha > ind.ultimaFecha)) ind.ultimaFecha = e.fecha;
    }
  }
  ind.vinosConEvidencia = conEvidencia.size;
  ind.diasConConsumo = dias.size;
  if (puntajes.length) {
    const dist = {};
    for (const p of puntajes) dist[String(p)] = (dist[String(p)] || 0) + 1;
    ind.puntuacion = {
      n: puntajes.length,
      promedio: puntajes.reduce((s, p) => s + p, 0) / puntajes.length,
      min: Math.min(...puntajes),
      max: Math.max(...puntajes),
      distribucion: dist,
    };
  }
  return ind;
}

// Construye grupos { clave, etiqueta, bloques: { <rol>: indicadores },
// evidencias: { <rol>: [ids] }, vinos: { <rol>: [wineIds] } }.
// asignar(clasificacionVino) → { destinos: [{ clave, etiqueta, rol }], motivo }
// (función pura: no modifica la clasificación).
function agrupar({ vinos, evidencias }, asignar, roles) {
  const evidenciasPorVino = new Map();
  for (const e of evidencias) {
    if (!evidenciasPorVino.has(e.wineId)) evidenciasPorVino.set(e.wineId, []);
    evidenciasPorVino.get(e.wineId).push(e);
  }
  const grupos = new Map();
  const sinClasificar = [];
  for (const [wineId, c] of vinos) {
    const { destinos, motivo = null } = asignar(c);
    if (!destinos.length) {
      sinClasificar.push({ wineId, motivo, evidencias: (evidenciasPorVino.get(wineId) || []).map((e) => e.id) });
      continue;
    }
    for (const { clave, etiqueta, rol } of destinos) {
      if (!grupos.has(clave)) {
        grupos.set(clave, {
          clave,
          etiqueta,
          _vinos: Object.fromEntries(roles.map((r) => [r, new Set()])),
          _evid: Object.fromEntries(roles.map((r) => [r, new Map()])),
        });
      }
      const g = grupos.get(clave);
      g._vinos[rol].add(wineId);
      for (const e of evidenciasPorVino.get(wineId) || []) g._evid[rol].set(e.id, e); // id único
    }
  }
  const lista = [...grupos.values()]
    .map((g) => ({
      clave: g.clave,
      etiqueta: g.etiqueta,
      bloques: Object.fromEntries(roles.map((r) => [r, calcularIndicadores(g._vinos[r], [...g._evid[r].values()])])),
      evidencias: Object.fromEntries(roles.map((r) => [r, [...g._evid[r].keys()].sort()])),
      vinos: Object.fromEntries(roles.map((r) => [r, [...g._vinos[r]].sort()])),
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave));
  return { grupos: lista, sinClasificar };
}

export function agregarPorCepa(extraccion) {
  return agrupar(
    extraccion,
    (c) => {
      const v = c.variedad;
      if (v.estado === CLASIFICACION.MONOVARIETAL) {
        return { destinos: [{ clave: v.ids[0], etiqueta: etiquetaDeVariedad(v.ids[0]), rol: "monovarietal" }] };
      }
      if (v.estado === CLASIFICACION.CORTE && v.ids.length) {
        return { destinos: v.ids.map((id) => ({ clave: id, etiqueta: etiquetaDeVariedad(id), rol: "enCorte" })) };
      }
      // corte sin componentes, ambigua, no_reconocida, sin_dato
      return { destinos: [], motivo: v.estado === CLASIFICACION.CORTE ? "corte_sin_componentes" : v.estado };
    },
    ["monovarietal", "enCorte"]
  );
}

export function agregarPorBodega(extraccion) {
  return agrupar(
    extraccion,
    (c) => {
      if (!c.bodega.clave) return { destinos: [], motivo: "sin_bodega" };
      return { destinos: [{ clave: c.bodega.clave, etiqueta: c.bodega.texto, rol: "total" }] };
    },
    ["total"]
  );
}

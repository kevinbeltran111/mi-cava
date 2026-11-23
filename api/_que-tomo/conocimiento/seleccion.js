// =============================================================================
// Etapa 7.3-B: selección de información pertinente para UNA consulta.
// =============================================================================
// Proyección mínima del perfil + biblioteca para el futuro recomendador
// (7.4). No reemplaza el contrato de 7.3-A (motor.js recibe
// { consulta, contexto, candidatos }); es lo que el motor debería usar para
// decidir qué datos personales salen hacia un proveedor de IA.
//
// Reutilizable para los tres modos: food, cellar, discovery. El endpoint de
// 7.3-A sigue rechazando 'discovery'; acá solo se prepara la capa.
//
// Qué se envía y qué no:
//   * nunca: usuarioId, nombres de perfil, emails, precio pagado, ids de
//     evidencias internas de otras tablas;
//   * candidatos (food / cellar): solo vinos disponibles (stock > 0) de la
//     biblioteca, reutilizando candidatos.js. Se excluyen solo los que una
//     restricción persistente o temporal alcanza de forma CONFIRMADA (con el
//     motivo); los de coincidencia 'posible' o 'no_evaluable' se conservan
//     y se listan en `inciertos`. 'discovery' no envía candidatos de la
//     biblioteca;
//   * experiencias: solo las pertinentes (food: comida coincidente; cellar:
//     las más recientes de cada candidato). Los comentarios viajan solo
//     dentro de esas experiencias y recortados;
//   * afinidades: indicadores agregados por cepa y bodega, sin comentarios.
//
// Los límites de tamaño (MAX_*) controlan cuánto texto sale en una consulta.
// No son reglas de aprendizaje ni afectan inferencias.
// =============================================================================

import { recuperarCandidatos } from "../candidatos.js";
import { aplicaAVino } from "./explicito.js";
import { esReserva } from "./reserva.js";
import { normalizarContextoTemporal } from "./temporal.js";
import { normalizarTexto } from "./normalizacion.js";
import { fallo } from "../errores.js";

export const MODOS_CONOCIMIENTO = Object.freeze(["food", "cellar", "discovery"]);
export const MAX_EXPERIENCIAS_FOOD = 8;
export const MAX_EXPERIENCIAS_POR_VINO = 2;
export const MAX_COMENTARIO = 280;

// Palabras sin contenido para comparar comidas.
const VACIAS = new Set(["con", "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "al", "a", "en", "para", "por", "algo", "hoy"]);

function palabrasComida(texto) {
  return new Set(normalizarTexto(texto).split(" ").filter((p) => p.length >= 3 && !VACIAS.has(p)));
}

function recortar(t) {
  if (!t) return null;
  return t.length > MAX_COMENTARIO ? `${t.slice(0, MAX_COMENTARIO - 1)}…` : t;
}

function experienciaCompacta(e, vino) {
  return {
    vino: vino ? { wineId: vino.id, nombre: vino.hechos.identidad.nombre } : null,
    fecha: e.fecha,
    puntuacion: e.puntuacion,
    comida: e.comida,
    comentario: recortar(e.comentario),
  };
}

function afinidadCompacta(tipo, g, restricciones) {
  const bloque = (b) => ({
    vinosConEvidencia: b.vinosConEvidencia,
    favoritos: b.favoritos,
    experienciasPuntuadas: b.experienciasPuntuadas,
    consumosSinPuntuar: b.consumosSinPuntuar,
    puntuacion: { n: b.puntuacion.n, promedio: b.puntuacion.promedio, min: b.puntuacion.min, max: b.puntuacion.max },
  });
  const bloques = Object.fromEntries(Object.entries(g.bloques).filter(([, b]) => b.vinosConEvidencia > 0).map(([k, b]) => [k, bloque(b)]));
  return {
    dimension: tipo,
    clave: g.clave,
    etiqueta: g.etiqueta,
    ...bloques,
    fuerza: g.fuerza.estado === "evaluada"
      ? { positiva: g.fuerza.positiva?.nivel ?? null, negativa: g.fuerza.negativa?.nivel ?? null, version: g.fuerza.version }
      : { estado: g.fuerza.estado },
    // Origen de las restricciones que alcanzan a este grupo ([] si ninguna).
    restringida: [...new Set(restricciones.filter((r) => r.alcance.tipo === tipo && r.alcance.clave === g.clave).map((r) => r.origen))],
  };
}

// { contexto } de 7.3-A y { perfil, extraccion } de construirConocimiento.
// consulta = { modo, temporal?: entrada de normalizarContextoTemporal }
export function seleccionarParaConsulta({ contexto, perfil, extraccion }, consulta = {}) {
  if (!MODOS_CONOCIMIENTO.includes(consulta.modo)) return fallo("validacion", `Modo no válido: ${consulta.modo}.`);
  const t = normalizarContextoTemporal(consulta.temporal || {});
  if (!t.ok) return fallo("validacion", t.errores.join(" "));
  const temporal = t.temporal;

  const persistentes = perfil.restricciones.persistentes;
  // 7.4-B3: una reserva «para una ocasión especial» es un conocimiento
  // explícito de alcance wine con la marca de reserva.js en `value` (nunca
  // se lee `meaning`). Excluye ese vino de toda consulta mientras esté activa.
  const reservas = perfil.explicito.conocimientoDeVinos.filter((k) => esReserva(k.valorRegistrado) && k.alcance.clave);
  const todas = [
    ...persistentes.map((r) => ({ origen: "persistente", id: r.id, alcance: r.alcance })),
    ...reservas.map((r) => ({ origen: "reserva", id: r.id, alcance: r.alcance })),
    ...temporal.restricciones.map((r, i) => ({ origen: "temporal", id: `temporal:${i + 1}`, alcance: r.alcance })),
  ];
  const porId = new Map((contexto?.biblioteca || []).map((v) => [v.id, v]));
  const conocimientoPorVino = new Map();
  for (const k of perfil.explicito.conocimientoDeVinos) {
    if (!k.alcance.clave || esReserva(k.valorRegistrado)) continue;
    if (!conocimientoPorVino.has(k.alcance.clave)) conocimientoPorVino.set(k.alcance.clave, []);
    conocimientoPorVino.get(k.alcance.clave).push(k.significado);
  }

  // --- candidatos (reutiliza 7.3-A) ---
  const candidatos = [];
  const excluidos = [];
  const inciertos = [];
  let noDisponibles = 0;
  if (consulta.modo !== "discovery") {
    for (const c of recuperarCandidatos(contexto).candidatos) {
      if (!c.disponibilidad.disponible) { noDisponibles += 1; continue; }
      const clas = extraccion.vinos.get(c.wineId);
      // Coincidencia de cada restricción con el vino:
      //   confirmada    → el vino se excluye (motivos);
      //   posible       → podría alcanzarlo (p. ej. varietal ambiguo o corte
      //                   incompleto): se conserva y se señala;
      //   no_evaluable  → no se puede saber (sin varietal, restricción
      //                   general, tipo de vino): se conserva y se señala.
      // 7.4 decide cómo tratar las inciertas; acá no se resuelven.
      const motivos = [];
      const coincidenciasInciertas = [];
      for (const r of todas) {
        const ap = clas ? aplicaAVino(r.alcance, clas) : "no_evaluable";
        if (ap === "aplica") motivos.push({ restriccion: r.id, origen: r.origen, coincidencia: "confirmada" });
        else if (ap === "posible" || ap === "no_evaluable") {
          coincidenciasInciertas.push({ restriccion: r.id, origen: r.origen, coincidencia: ap, alcance: { tipo: r.alcance.tipo, clave: r.alcance.clave } });
        }
      }
      if (motivos.length) { excluidos.push({ wineId: c.wineId, nombre: c.identidad.nombre, motivos }); continue; }
      for (const x of coincidenciasInciertas) inciertos.push({ wineId: c.wineId, ...x });
      candidatos.push({
        wineId: c.wineId,
        identidad: c.identidad,
        variedad: clas ? { estado: clas.variedad.estado, ids: clas.variedad.ids } : null,
        disponible: true,
        stock: c.disponibilidad.stock,
        favorito: c.favorito,
        valoracion: c.valoracion,
        consumidoAntes: c.historial.consumidoAntes,
        conocimiento: conocimientoPorVino.get(c.wineId) || [],
        coincidenciasInciertas,
      });
    }
  }

  // --- experiencias pertinentes ---
  let experiencias = [];
  let totalExperiencias = 0;
  let comentariosTotales = 0;
  for (const v of contexto?.biblioteca || []) {
    for (const e of v.senales.experiencias || []) {
      totalExperiencias += 1;
      if (e.comentario) comentariosTotales += 1;
    }
  }
  // Las experiencias de vinos alcanzados por una restricción (persistente o
  // temporal) no se envían: el recomendador no podría ofrecerlos.
  const idsExcluidos = new Set(excluidos.map((x) => x.wineId));
  if (consulta.modo !== "discovery") {
    for (const v of contexto?.biblioteca || []) {
      if (idsExcluidos.has(v.id)) continue;
      const clas = extraccion.vinos.get(v.id);
      if (clas && todas.some((r) => aplicaAVino(r.alcance, clas) === "aplica")) idsExcluidos.add(v.id);
    }
  }
  if (consulta.modo === "food" && temporal.comida) {
    const buscadas = palabrasComida(temporal.comida);
    const coincidentes = [];
    for (const v of contexto?.biblioteca || []) {
      if (idsExcluidos.has(v.id)) continue;
      for (const e of v.senales.experiencias || []) {
        if (!e.comida) continue;
        const p = palabrasComida(e.comida);
        if ([...buscadas].some((x) => p.has(x))) coincidentes.push(experienciaCompacta(e, v));
      }
    }
    experiencias = coincidentes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, MAX_EXPERIENCIAS_FOOD);
  } else if (consulta.modo === "cellar") {
    for (const c of candidatos) {
      const v = porId.get(c.wineId);
      for (const e of (v?.senales.experiencias || []).slice(0, MAX_EXPERIENCIAS_POR_VINO)) experiencias.push(experienciaCompacta(e, v));
    }
  }

  const afinidades = [
    ...perfil.inferencias.calculadas.cepas.grupos.map((g) => ["grape", g]),
    ...perfil.inferencias.calculadas.bodegas.grupos.map((g) => ["winery", g]),
  ]
    .filter(([, g]) => Object.values(g.bloques).some((b) => b.vinosConEvidencia > 0))
    .map(([tipo, g]) => afinidadCompacta(tipo, g, todas));

  const d = perfil.declarado;
  const resultado = {
    version: perfil.version,
    modo: consulta.modo,
    declarado: d.registrada
      ? { tipos: d.tipos, variedades: d.variedadesEtiquetas, nivel: d.nivel }
      : { registrada: false },
    explicito: perfil.explicito.preferencias.map((p) => ({ alcance: { tipo: p.alcance.tipo, clave: p.alcance.clave, valor: p.alcance.valor }, significado: p.significado, polaridad: p.polaridad.estado })),
    restricciones: {
      persistentes: persistentes.map((r) => ({ alcance: { tipo: r.alcance.tipo, clave: r.alcance.clave, valor: r.alcance.valor }, significado: r.significado, aplicacion: r.aplicacion })),
      temporales: temporal.restricciones.map((r) => ({ alcance: { tipo: r.alcance.tipo, clave: r.alcance.clave, valor: r.alcance.valor }, texto: r.texto, persistente: false })),
    },
    temporal: { comida: temporal.comida, presupuesto: temporal.presupuesto },
    afinidades,
    candidatos,
    excluidos,
    // Candidatos conservados con al menos una restricción de alcance incierto.
    inciertos,
    experiencias,
    contradicciones: perfil.contradicciones.map((c) => ({ tipo: c.tipo, estado: c.estado, alcance: c.alcance, prevalece: c.prevalece })),
    omitido: {
      vinosNoDisponibles: noDisponibles,
      vinosNoEnviados: (contexto?.biblioteca || []).length - candidatos.length,
      experienciasNoEnviadas: totalExperiencias - experiencias.length,
      comentariosNoEnviados: comentariosTotales - experiencias.filter((e) => e.comentario).length,
    },
  };
  return { ok: true, seleccion: resultado };
}

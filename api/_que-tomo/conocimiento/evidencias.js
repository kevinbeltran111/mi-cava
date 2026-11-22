// =============================================================================
// Etapa 7.3-B: evidencias individuales y trazables.
// =============================================================================
// Parte EXCLUSIVAMENTE de la representación de 7.3-A
// (contexto.js → representarContexto). No vuelve a leer la base ni crea un
// segundo constructor de contexto.
//
// Una evidencia es un hecho registrado por el usuario que puede decir algo
// sobre su gusto, con referencia a su fila de origen:
//
//   favorito             wine_privado.favorito = true (marca explícita)
//   experiencia_puntuada consumos con puntuacion (evaluación declarada; la
//                        puntuación se conserva tal cual, SIN clasificarla
//                        como buena o mala: eso requiere una regla validada)
//   consumo_sin_puntuar  consumos sin puntuacion (frecuencia; satisfacción
//                        desconocida)
//
// NO son evidencia de gusto y no se generan: stock, alta del vino, estado
// «guardado», precio pagado, maridaje sugerido, origen.
// ratings (tabla legado) no se incorpora en 7.3-B: ver TIPOS_RESERVADOS.
// =============================================================================

import { clasificarVarietal, claveBodega } from "./normalizacion.js";

export const TIPOS_EVIDENCIA = Object.freeze({
  FAVORITO: "favorito",
  EXPERIENCIA_PUNTUADA: "experiencia_puntuada",
  CONSUMO_SIN_PUNTUAR: "consumo_sin_puntuar",
});

// Reservado para integrar ratings históricos cuando se resuelva su
// superposición con consumos. Hoy no se genera.
export const TIPOS_RESERVADOS = Object.freeze({ RATING_HISTORICO: "rating_historico" });

// Clasificación de cada vino de la biblioteca: variedad y bodega
// normalizadas. Es un hecho del vino, no una evidencia.
export function clasificarVino(vino) {
  const id = vino.hechos.identidad;
  return {
    wineId: vino.id,
    nombre: id.nombre,
    variedad: clasificarVarietal(id.varietal),
    bodega: { clave: claveBodega(id.bodega), texto: id.bodega ?? null },
    disponible: Boolean(vino.hechos.disponibilidad?.disponible),
  };
}

// contexto: salida de representarContexto (7.3-A).
// Devuelve { vinos: Map<wineId, clasificación>, evidencias: [...] }.
// Cada evidencia tiene un id estable derivado de su fila de origen, así que
// ninguna experiencia puede contarse dos veces.
export function extraerEvidencias(contexto) {
  const vinos = new Map();
  const evidencias = [];
  for (const v of contexto?.biblioteca || []) {
    vinos.set(v.id, clasificarVino(v));
    if (v.senales.favorito) {
      evidencias.push({
        id: `favorito:${v.id}`,
        tipo: TIPOS_EVIDENCIA.FAVORITO,
        wineId: v.id,
        origen: { tabla: "wine_privado", wineId: v.id },
      });
    }
    for (const e of v.senales.experiencias || []) {
      const puntuada = e.puntuacion !== null && e.puntuacion !== undefined;
      evidencias.push({
        id: `consumo:${e.id}`,
        tipo: puntuada ? TIPOS_EVIDENCIA.EXPERIENCIA_PUNTUADA : TIPOS_EVIDENCIA.CONSUMO_SIN_PUNTUAR,
        wineId: v.id,
        consumoId: e.id,
        fecha: e.fecha ?? null,
        puntuacion: puntuada ? e.puntuacion : null,
        tieneComida: Boolean(e.comida),
        tieneComentario: Boolean(e.comentario),
        origen: { tabla: "consumos", id: e.id },
      });
    }
  }
  return { vinos, evidencias };
}

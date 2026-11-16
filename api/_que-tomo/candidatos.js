// =============================================================================
// Etapa 7.3-A: candidatos reales de la biblioteca del usuario.
// =============================================================================
// Un candidato es SIEMPRE un vino existente de la biblioteca del usuario
// (leído con su token). No hay vinos nuevos ni externos en 7.3.
//
// Este módulo NO filtra, NO ordena por gusto y NO aplica restricciones:
// devuelve toda la biblioteca en un orden neutral, con los datos separados
// para que 7.3-B decida. En particular:
//   * `disponibilidad` (stock) y `historial` (consumos) son hechos;
//   * `favorito` y `valoracion` son las únicas señales de agrado registradas;
//   * un vino con stock y sin consumos NO es un vino que «le gusta»;
//   * un vino consumido sin puntuación tiene satisfacción desconocida.
// =============================================================================

// Identidad que se guarda en recommendation_items.wine_identity. Sale de la
// base, nunca del motor: así ninguna recomendación puede renombrar o inventar
// una botella.
export function identidadDeVino(vino) {
  const { identidad, origen } = vino.hechos;
  return {
    nombre: identidad.nombre,
    bodega: identidad.bodega,
    varietal: identidad.varietal,
    anada: identidad.anada,
    lugar: origen.lugar,
    region: origen.region,
  };
}

export function recuperarCandidatos(contexto) {
  const candidatos = (contexto?.biblioteca || []).map((v) => ({
    wineId: v.id,
    identidad: identidadDeVino(v),
    // wine_identity exige nombre no vacío (CHECK de 7.1).
    persistible: typeof v.hechos.identidad.nombre === "string" && v.hechos.identidad.nombre.trim().length > 0,
    disponibilidad: { ...v.hechos.disponibilidad },
    historial: {
      consumidoAntes: v.senales.consumo.veces > 0,
      veces: v.senales.consumo.veces,
      ultimaFecha: v.senales.consumo.ultimaFecha,
    },
    favorito: v.senales.favorito,
    valoracion: { ...v.senales.valoracion },
    conocimientoAsociado: [...v.conocimientoAsociado],
  }));

  return {
    candidatos,
    resumen: {
      total: candidatos.length,
      disponibles: candidatos.filter((c) => c.disponibilidad.disponible).length,
      consumidosAntes: candidatos.filter((c) => c.historial.consumidoAntes).length,
      favoritos: candidatos.filter((c) => c.favorito).length,
    },
  };
}

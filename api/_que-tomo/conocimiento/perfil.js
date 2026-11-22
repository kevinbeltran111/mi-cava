// =============================================================================
// Etapa 7.3-B: perfil personal explicable.
// =============================================================================
// Entrada: la representación de 7.3-A (contexto.js → representarContexto).
// No lee la base. Separa:
//   declarado     onboarding 7.2 (user_preferences)
//   hechos        lo registrado en la app, sin leerlo como gusto
//   explicito     preferencias explícitas y conocimiento sobre vinos
//   restricciones persistentes (user_knowledge 'restriction')
//   inferencias   almacenadas (con su evidencia reconstruida) y calculadas
//                 (indicadores por cepa y bodega; nivel solo con reglas
//                 validadas)
//   contradicciones
//   temporal      SIEMPRE null en el perfil: el contexto temporal pertenece
//                 a cada consulta (seleccion.js) y no forma parte de lo que
//                 Mi Cava sabe del usuario.
// =============================================================================

import { extraerEvidencias } from "./evidencias.js";
import { agregarPorCepa, agregarPorBodega } from "./agregacion.js";
import { evaluarFuerza, REGLAS_VALIDADAS } from "./fuerza.js";
import { clasificarConocimiento } from "./explicito.js";
import { detectarContradicciones } from "./contradicciones.js";
import { reconstruir } from "./explicar.js";
import { etiquetaDeVariedad, CLASIFICACION } from "./normalizacion.js";

export const VERSION_PERFIL = "7.3-B.1";

function resumenHechos(contexto, extraccion) {
  const bib = contexto?.biblioteca || [];
  const variedades = {};
  for (const c of extraccion.vinos.values()) variedades[c.variedad.estado] = (variedades[c.variedad.estado] || 0) + 1;
  return {
    vinos: bib.length,
    disponibles: bib.filter((v) => v.hechos.disponibilidad.disponible).length,
    vinosConsumidos: bib.filter((v) => v.senales.consumo.veces > 0).length,
    consumos: bib.reduce((s, v) => s + v.senales.consumo.veces, 0),
    consumosPuntuados: bib.reduce((s, v) => s + v.senales.valoracion.puntuadas, 0),
    favoritos: bib.filter((v) => v.senales.favorito).length,
    clasificacionVariedades: variedades,
    // Recordatorio explícito de qué NO son estos números.
    nota: "Stock, cantidad de vinos y cantidad de consumos son hechos; no indican agrado.",
  };
}

// opciones.reglas: reglas de fuerza validadas (fuerza.js). Por defecto
// REGLAS_VALIDADAS (null → ningún nivel se asigna).
export function construirConocimiento(contexto, { reglas = REGLAS_VALIDADAS } = {}) {
  const extraccion = extraerEvidencias(contexto);
  const cepas = agregarPorCepa(extraccion);
  const bodegas = agregarPorBodega(extraccion);

  const fuerza = {};
  for (const g of cepas.grupos) fuerza[`grape:${g.clave}`] = evaluarFuerza(g.bloques, reglas);
  for (const g of bodegas.grupos) fuerza[`winery:${g.clave}`] = evaluarFuerza(g.bloques, reglas);

  const conocimiento = clasificarConocimiento(contexto);
  const declaradas = contexto?.preferencias?.declaradas || { registrada: false };
  const contradicciones = detectarContradicciones({ declaradas, conocimiento, extraccion, cepas, bodegas, fuerza });

  const conFuerza = (tipo) => (g) => ({ ...g, fuerza: fuerza[`${tipo}:${g.clave}`] });

  const perfil = {
    version: VERSION_PERFIL,
    versionContexto: contexto?.version ?? null,
    usuarioId: contexto?.usuarioId ?? null,
    declarado: declaradas.registrada
      ? { ...declaradas, variedadesEtiquetas: (declaradas.variedades || []).map((id) => etiquetaDeVariedad(id) ?? id) }
      : declaradas,
    hechos: resumenHechos(contexto, extraccion),
    explicito: {
      preferencias: conocimiento.preferenciasExplicitas.map((p) => ({ ...p, explicacion: reconstruir(p, "explicit", contexto) })),
      conocimientoDeVinos: conocimiento.conocimientoDeVinos.map((p) => ({ ...p, explicacion: reconstruir(p, "explicit", contexto) })),
    },
    restricciones: {
      persistentes: conocimiento.restriccionesPersistentes.map((r) => ({ ...r, explicacion: reconstruir(r, "restriction", contexto) })),
    },
    inferencias: {
      almacenadas: conocimiento.inferenciasAlmacenadas.map((i) => ({ ...i, explicacion: reconstruir(i, "inference", contexto) })),
      calculadas: {
        reglas: reglas ? { estado: "aplicadas", version: reglas.version ?? null } : { estado: "sin_regla_validada", version: null },
        cepas: { grupos: cepas.grupos.map(conFuerza("grape")), sinClasificar: cepas.sinClasificar },
        bodegas: { grupos: bodegas.grupos.map(conFuerza("winery")), sinClasificar: bodegas.sinClasificar },
      },
    },
    contradicciones,
    temporal: null,
  };

  return { perfil, extraccion, conocimiento };
}

// Respuestas a los criterios de aceptación de 7.3-B, a partir del perfil y,
// opcionalmente, de una selección para una consulta (seleccion.js).
export function responderCriterios(perfil, seleccion = null) {
  const calculadas = [...perfil.inferencias.calculadas.cepas.grupos.map((g) => ["grape", g]), ...perfil.inferencias.calculadas.bodegas.grupos.map((g) => ["winery", g])];
  return {
    queDeclaro: perfil.declarado,
    queHechosRegistro: perfil.hechos,
    queSePuedeInferir: {
      almacenadas: perfil.inferencias.almacenadas.map((i) => ({ id: i.id, significado: i.significado, fuerza: i.fuerzaRegistrada, respaldo: i.explicacion.estado })),
      calculadas: calculadas
        .filter(([, g]) => g.fuerza.positiva || g.fuerza.negativa)
        .map(([tipo, g]) => ({ tipo, clave: g.clave, positiva: g.fuerza.positiva?.nivel ?? null, negativa: g.fuerza.negativa?.nivel ?? null })),
      reglas: perfil.inferencias.calculadas.reglas,
    },
    conQueEvidencias: calculadas.map(([tipo, g]) => ({
      tipo,
      clave: g.clave,
      etiqueta: g.etiqueta,
      evidencias: g.evidencias,
      indicadores: g.bloques,
      fuerza: g.fuerza.estado === "evaluada" ? { positiva: g.fuerza.positiva?.nivel ?? null, negativa: g.fuerza.negativa?.nivel ?? null, version: g.fuerza.version } : { estado: g.fuerza.estado },
    })),
    restriccionesPersistentes: perfil.restricciones.persistentes.map((r) => ({ id: r.id, alcance: r.alcance, significado: r.significado, aplicacion: r.aplicacion })),
    queSeEnviariaAlRecomendador: seleccion,
    ocasionalVsPermanente: {
      regla: "Las restricciones temporales viven solo en la consulta (persistente: false) y nunca forman parte del perfil; las persistentes provienen de user_knowledge 'restriction'.",
      temporalesDeLaConsulta: seleccion?.restricciones?.temporales ?? [],
      perfilTemporal: perfil.temporal,
    },
    clasificacionSinVariedad: Object.fromEntries(Object.entries(perfil.hechos.clasificacionVariedades).filter(([k]) => k !== CLASIFICACION.MONOVARIETAL)),
  };
}

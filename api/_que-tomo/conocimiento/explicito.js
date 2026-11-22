// =============================================================================
// Etapa 7.3-B: conocimiento explícito, restricciones persistentes y
// conocimiento sobre vinos, a partir de user_knowledge (vía 7.3-A).
// =============================================================================
// Mapeo de los casos aprobados al esquema real de 7.1 (sin cambiarlo):
//
//   «No me gusta el Malbec»       knowledge_type 'explicit', scope 'grape'.
//                                 Es una preferencia (negativa). La POLARIDAD
//                                 no tiene columna: solo podría ir en `value`
//                                 (jsonb libre) y su formato no está aprobado
//                                 → leerPolaridad() la devuelve como
//                                 'pendiente_contrato_value'. No se infiere
//                                 del texto de `meaning`.
//   «No me recomiendes Malbec»    knowledge_type 'restriction', scope 'grape'.
//                                 Persistente: excluye. Prevalece siempre.
//   «Hoy no quiero Malbec»        NO es user_knowledge: es contexto temporal
//                                 de la consulta (temporal.js).
//   «Esta la guardo para          knowledge_type 'explicit', scope 'wine'
//    ocasiones especiales»        (wine_id + wine_snapshot). Conocimiento
//                                 sobre ESE vino, no una preferencia general.
//
// 7.3-A ya separa explicit / restriction / inference (contexto.js). Este
// módulo solo normaliza alcances y decide cómo aplican.
// =============================================================================

import { resolverAlcanceVariedad, claveBodega, CLASIFICACION, tokensDeVariedad } from "./normalizacion.js";

export const ESTADO_POLARIDAD = Object.freeze({ PENDIENTE_CONTRATO: "pendiente_contrato_value" });

// Hasta que se apruebe un contrato para `value`, la polaridad de un
// conocimiento explícito no se interpreta. El valor original se conserva en
// `valorRegistrado` para no perder información.
export function leerPolaridad(_value) {
  return { estado: ESTADO_POLARIDAD.PENDIENTE_CONTRATO, polaridad: null };
}

// Alcance normalizado de un conocimiento (k = representación de 7.3-A).
//   clave: id de catálogo (grape), clave de bodega (winery), wineId (wine),
//          tipo (wine_type) o null (general / no normalizable).
export function normalizarAlcance(alcance) {
  const { tipo, valor = null, wineId = null, vinoRegistrado = null } = alcance || {};
  switch (tipo) {
    case "grape": {
      const r = resolverAlcanceVariedad(valor);
      return { tipo, valor, clave: r.id, normalizado: Boolean(r.id), estadoNormalizacion: r.estado };
    }
    case "winery": {
      const c = claveBodega(valor);
      return { tipo, valor, clave: c, normalizado: Boolean(c), estadoNormalizacion: c ? "ok" : CLASIFICACION.SIN_DATO };
    }
    case "wine":
      // wine_id NULL = el vino fue borrado (FK ON DELETE SET NULL); queda el
      // snapshot para que el registro siga siendo legible.
      return { tipo, valor, clave: wineId, normalizado: Boolean(wineId), estadoNormalizacion: wineId ? "ok" : "vino_eliminado", vinoRegistrado };
    case "wine_type":
      return { tipo, valor, clave: valor, normalizado: true, estadoNormalizacion: "ok" };
    case "general":
      return { tipo, valor: null, clave: null, normalizado: false, estadoNormalizacion: "general" };
    default:
      return { tipo: tipo ?? null, valor, clave: null, normalizado: false, estadoNormalizacion: "desconocido" };
  }
}

// ¿Aplica una restricción (alcance normalizado) a un vino clasificado
// (evidencias.js → clasificarVino)?
//   'aplica' | 'posible' | 'no_aplica' | 'no_evaluable'
export function aplicaAVino(alcance, vino) {
  switch (alcance.tipo) {
    case "wine":
      return alcance.clave && alcance.clave === vino.wineId ? "aplica" : "no_aplica";
    case "winery":
      if (!alcance.clave) return "no_evaluable";
      if (!vino.bodega.clave) return "no_evaluable";
      return vino.bodega.clave === alcance.clave ? "aplica" : "no_aplica";
    case "grape": {
      if (!alcance.clave) return "no_evaluable";
      const v = vino.variedad;
      if (v.ids.includes(alcance.clave)) return "aplica"; // monovarietal o componente de corte
      if (v.estado === CLASIFICACION.AMBIGUA) {
        const t = tokensDeVariedad(alcance.clave);
        return (v.sinResolver || []).some((x) => t.has(x)) ? "posible" : "no_aplica";
      }
      if (v.estado === CLASIFICACION.MONOVARIETAL) return "no_aplica";
      if (v.estado === CLASIFICACION.CORTE && v.ids.length) {
        // Solo un corte incompleto («Malbec / Shiraz») puede contener una
        // variedad no listada; uno con todos sus componentes reconocidos no.
        return v.detalle === "componentes_incompletos" ? "posible" : "no_aplica";
      }
      return "no_evaluable"; // sin dato, no reconocida, corte sin componentes
    }
    case "wine_type":
      return "no_evaluable"; // los vinos no tienen tipo y no se deduce de la cepa
    default:
      return "no_evaluable"; // 'general': requiere interpretación (texto libre)
  }
}

function comun(k) {
  return {
    id: k.id,
    alcance: normalizarAlcance(k.alcance),
    significado: k.significado,
    fuerzaRegistrada: k.fuerza ?? null,
    fuente: k.fuente,
    registradoEn: k.registradoEn ?? null,
  };
}

// contexto: representarContexto (7.3-A).
export function clasificarConocimiento(contexto) {
  const explicitas = contexto?.preferencias?.explicitas || [];
  const restricciones = contexto?.restricciones || [];
  const inferencias = contexto?.inferencias || [];

  return {
    preferenciasExplicitas: explicitas
      .filter((k) => k.alcance?.tipo !== "wine")
      .map((k) => ({ ...comun(k), polaridad: leerPolaridad(k.valor), valorRegistrado: k.valor ?? null })),
    conocimientoDeVinos: explicitas
      .filter((k) => k.alcance?.tipo === "wine")
      .map((k) => ({ ...comun(k), valorRegistrado: k.valor ?? null })),
    restriccionesPersistentes: restricciones.map((k) => {
      const base = comun(k);
      const a = base.alcance;
      let aplicacion = "automatica";
      if (a.tipo === "general") aplicacion = "requiere_interpretacion";
      else if (a.tipo === "wine_type") aplicacion = "sin_tipo_en_biblioteca";
      else if (!a.normalizado) aplicacion = "alcance_no_normalizado";
      return { ...base, persistente: true, aplicacion, valorRegistrado: k.valor ?? null };
    }),
    inferenciasAlmacenadas: inferencias.map((k) => ({ ...comun(k), evidenciaRegistrada: k.evidencia ?? null, valorRegistrado: k.valor ?? null })),
  };
}

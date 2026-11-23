// =============================================================================
// Etapa 7.4-B4: lógica pura de la pantalla «Elegir de mi cava» (sin React ni
// red), para poder probarla con node --test.
// =============================================================================
import { VARIEDADES } from "../onboarding/catalogo.js";

export const FASES = Object.freeze({
  CARGANDO: "cargando",
  OK: "ok",
  SIN_CANDIDATOS: "sin_candidatos",
  ERROR: "error",
  // la reserva se guardó, pero la tanda siguiente no se pudo generar
  RESERVA_SIN_TANDA: "reserva_sin_tanda",
});

const normalizar = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ¿El texto de varietal nombra esta variedad del catálogo (como palabras
// completas)? «Malbec - Syrah» nombra Malbec y Syrah; «Cabernet» no nombra
// ninguna Cabernet (es ambiguo: lo decide el servidor como incierto).
function nombra(varietal, etiqueta) {
  const v = ` ${normalizar(varietal)} `;
  return v.includes(` ${normalizar(etiqueta)} `);
}

// Variedades que se pueden evitar hoy: las del catálogo que aparecen en los
// vinos con stock que siguen en juego (no alcanzados ya por un filtro
// aplicado) y que todavía no son un filtro de la consulta. Orden: más vinos
// primero; a igual cantidad, el orden del catálogo.
export function variedadesParaEvitar(vinos, filtrosAplicados = []) {
  const aplicadas = new Set(filtrosAplicados.map((f) => f.clave));
  const etiquetasAplicadas = VARIEDADES.filter((x) => aplicadas.has(x.id)).map((x) => x.etiqueta);
  const conStock = (vinos || []).filter((w) => (w.stock ?? 0) > 0 && w.varietal && !etiquetasAplicadas.some((e) => nombra(w.varietal, e)));
  return VARIEDADES
    .filter((x) => !aplicadas.has(x.id))
    .map((x) => ({ id: x.id, etiqueta: x.etiqueta, orden: x.orden ?? 0, vinos: conStock.filter((w) => nombra(w.varietal, x.etiqueta)).length }))
    .filter((x) => x.vinos > 0)
    .sort((a, b) => b.vinos - a.vinos || a.orden - b.orden)
    .map(({ id, etiqueta, vinos }) => ({ id, etiqueta, vinos }));
}

// Aviso de un vino recomendado cuya relación con un filtro no se pudo
// confirmar: nunca se presenta la exclusión como garantizada.
export function avisoIncierto(rec, filtros = []) {
  const inciertas = rec?.inciertas || [];
  if (!inciertas.length) return null;
  const etiquetas = inciertas.map((x) => filtros.find((f) => f.clave === x.clave)?.etiqueta || x.clave);
  const lista = etiquetas.length === 1 ? etiquetas[0] : `${etiquetas.slice(0, -1).join(", ")} o ${etiquetas[etiquetas.length - 1]}`;
  const sinDato = inciertas.every((x) => x.coincidencia === "no_evaluable");
  return sinDato
    ? `No sabemos si este vino es ${lista}: su varietal no está registrado.`
    : `No podemos confirmar si este vino es ${lista}: su varietal no lo indica con claridad.`;
}

// Texto y acción de cada estado sin resultados. `accion` la resuelve la
// pantalla: agregar_vino | nueva_consulta | deshacer_reserva | volver.
export function estadoSinCandidatos(motivo, { hayReservaReciente = false } = {}) {
  switch (motivo) {
    case "biblioteca_vacia":
      return { titulo: "Tu cava todavía está vacía", detalle: "Cargá tu primer vino y te ayudamos a elegir.", accion: "agregar_vino", etiquetaAccion: "Agregar vino" };
    case "sin_stock":
      return { titulo: "No tenés botellas disponibles", detalle: "Todos tus vinos están sin stock. Sumá botellas o cargá un vino nuevo para recibir una recomendación.", accion: "volver", etiquetaAccion: "Ir a Mi Cava" };
    case "excluidos_por_filtro":
      return { titulo: "Con los filtros de hoy no queda ningún vino", detalle: "Las variedades que elegiste evitar dejan fuera todo lo que tenés disponible.", accion: "nueva_consulta", etiquetaAccion: "Empezar de nuevo sin filtros" };
    case "excluidos_por_reserva":
      return hayReservaReciente
        ? { titulo: "Lo que tenés disponible está reservado", detalle: "Guardaste para una ocasión especial el último vino disponible.", accion: "deshacer_reserva", etiquetaAccion: "Deshacer la reserva" }
        : { titulo: "Lo que tenés disponible está reservado", detalle: "Tus vinos con stock están guardados para una ocasión especial. Podés quitar la reserva desde la ficha de cada vino.", accion: "volver", etiquetaAccion: "Ir a Mi Cava" };
    case "excluidos_por_restriccion":
      return { titulo: "Ningún vino disponible cumple tus restricciones", detalle: "Las restricciones que guardaste excluyen todo lo que tenés con stock.", accion: "volver", etiquetaAccion: "Ir a Mi Cava" };
    default:
      return { titulo: "No encontramos un vino para recomendarte", detalle: "", accion: "volver", etiquetaAccion: "Ir a Mi Cava" };
  }
}

// Secuencia de consultas: cada consulta nueva (o el cierre) invalida las
// respuestas de pedidos anteriores.
export function crearSecuencia() {
  let actual = 0;
  return {
    nueva() { actual += 1; return actual; },
    vigente(n) { return n === actual; },
  };
}

// Clave para medir `shown` una sola vez por tanda visible.
export const claveTanda = (sesionId, tanda) => `${sesionId}:${tanda}`;

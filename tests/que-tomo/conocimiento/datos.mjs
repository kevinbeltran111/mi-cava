// Datos SINTÉTICOS para las pruebas de 7.3-B. Ningún dato real.
// Todo pasa por representarContexto() de 7.3-A: las pruebas usan la misma
// representación que produce el endpoint.
import { representarContexto } from "../../../api/_que-tomo/contexto.js";

export const U = "00000000-0000-0000-0000-0000000b3001";
export const OTRO = "00000000-0000-0000-0000-0000000b3002";

let n = 0;
const uuid = (p) => `${p}0000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;

// vinos: [{ id?, nombre?, varietal, bodega, stock, favorito, precio,
//           consumos: [{ id?, fecha, puntuacion, comida, comentario }] }]
// conocimiento: filas de user_knowledge (activas) con los campos de 7.1.
export function filas({ preferencias = null, conocimiento = [], vinos = [] } = {}) {
  const f = { preferencias, conocimiento, vinos: [], privados: [], consumos: [] };
  vinos.forEach((v, i) => {
    const id = v.id ?? uuid("a");
    f.vinos.push({
      id, nombre: v.nombre ?? `Vino ${i + 1}`, bodega: v.bodega ?? null, varietal: v.varietal ?? null,
      anada: v.anada ?? null, region: v.region ?? null, lugar: v.lugar ?? null, maridaje: v.maridaje ?? null,
      created_at: v.created_at ?? `2026-0${(i % 9) + 1}-01T00:00:00Z`,
    });
    if (v.sinPrivado !== true) f.privados.push({ wine_id: id, precio: v.precio ?? null, stock: v.stock ?? 0, favorito: Boolean(v.favorito) });
    for (const c of v.consumos || []) {
      f.consumos.push({ id: c.id ?? uuid("c"), wine_id: id, fecha: c.fecha ?? "2026-10-01T21:00:00Z", puntuacion: c.puntuacion ?? null, comida: c.comida ?? null, comentario: c.comentario ?? null });
    }
  });
  return f;
}

export function contexto(datos = {}, usuario = U) {
  return representarContexto(filas(datos), usuario);
}

export function preferencias(over = {}) {
  return {
    user_id: U, onboarding_status: "completed", wine_types_answer: "answered",
    preferred_wine_types: ["tinto"], exploration_open: false, preferred_grapes: ["malbec"],
    knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z", ...over,
  };
}

export function conocimiento(over) {
  return {
    id: over.id ?? uuid("d"), knowledge_type: "explicit", scope_type: "general", scope_value: null,
    wine_id: null, wine_snapshot: null, meaning: "dato de prueba", value: null, strength: null,
    source_type: "conversation", evidence: null, created_at: "2026-11-01T00:00:00Z", ...over,
  };
}

// Reglas SOLO PARA PRUEBAS del mecanismo. No son una calibración ni una
// propuesta de umbrales: existen para verificar que el mecanismo funciona.
export const REGLAS_DE_PRUEBA = Object.freeze({
  version: "prueba-no-calibrada",
  positiva: {
    relevant: [{ indicador: "monovarietal.experienciasPuntuadas", op: ">=", valor: 2 }, { indicador: "monovarietal.puntuacion.min", op: ">=", valor: 4 }],
    indication: [{ indicador: "monovarietal.favoritos", op: ">=", valor: 1 }],
  },
  negativa: {
    indication: [{ indicador: "monovarietal.puntuacion.max", op: "<=", valor: 2 }],
  },
});

// Variante para agregaciones por bodega (bloque 'total').
export const REGLAS_DE_PRUEBA_BODEGA = Object.freeze({
  version: "prueba-no-calibrada-bodega",
  positiva: { indication: [{ indicador: "total.favoritos", op: ">=", valor: 1 }] },
});

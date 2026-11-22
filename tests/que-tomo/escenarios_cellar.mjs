// 7.4-B1: escenarios SINTÉTICOS para «Elegir de mi cava». Ningún dato real.
import { representarContexto } from "../../api/_que-tomo/contexto.js";

export const U = "00000000-0000-0000-0000-00000000c741";

// id legible y estable: v(1) → "c7400000-0000-0000-0000-000000000001"
export const v = (n) => `c7400000-0000-0000-0000-${String(n).padStart(12, "0")}`;

export const PREFERENCIAS = {
  onboarding_status: "completed", wine_types_answer: "answered", preferred_wine_types: ["tinto"],
  exploration_open: true, preferred_grapes: ["cabernet_franc", "pinot_noir"], knowledge_level: "intermediate",
  updated_at: "2026-11-15T10:00:00Z",
};

// vinos: [{ id, nombre, bodega, varietal, stock, favorito, precio, puntuaciones, created_at }]
// Sin `stock` no hay fila en wine_privado. created_at por defecto: más
// reciente cuanto antes aparece en la lista.
export function filas({ vinos = [], preferencias = PREFERENCIAS, conocimiento = [] } = {}) {
  return {
    preferencias: preferencias ? { user_id: U, ...preferencias } : null,
    conocimiento: conocimiento.map((k, i) => ({
      id: `k${i + 1}`, wine_id: null, wine_snapshot: null, value: null, strength: null, source_type: "conversation",
      evidence: null, scope_value: null, created_at: "2026-11-01T00:00:00Z", ...k,
    })),
    vinos: vinos.map((w, i) => ({
      id: w.id, nombre: w.nombre ?? `Vino ${i + 1}`, bodega: w.bodega ?? null, varietal: w.varietal ?? null, anada: w.anada ?? null,
      region: null, lugar: null, maridaje: null, created_at: w.created_at ?? `2026-10-${String(28 - i).padStart(2, "0")}T00:00:00Z`,
    })),
    privados: vinos.filter((w) => w.stock !== undefined).map((w) => ({ wine_id: w.id, precio: w.precio ?? null, stock: w.stock, favorito: Boolean(w.favorito) })),
    consumos: vinos.flatMap((w) => (w.puntuaciones || []).map((p, j) => ({
      id: `${w.id}-c${j + 1}`, wine_id: w.id, fecha: `2026-09-${String(10 + j).padStart(2, "0")}T21:00:00Z`, puntuacion: p, comida: null, comentario: null,
    }))),
  };
}

export const contextoDe = (opciones) => representarContexto(filas(opciones), U);

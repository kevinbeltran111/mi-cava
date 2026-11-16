// Datos SINTÉTICOS para las pruebas de 7.3-A. Ningún dato real.
export const U = "00000000-0000-0000-0000-00000000aa01";

export const W = {
  favorito: "10000000-0000-0000-0000-000000000001", // favorito, stock 2, 2 experiencias 4,5 y 5
  stockSinTomar: "10000000-0000-0000-0000-000000000002", // stock 6, nunca consumido
  tomadoMal: "10000000-0000-0000-0000-000000000003", // stock 0, 2 consumos: 1,5 y sin puntuar
  tomadoSinPuntuar: "10000000-0000-0000-0000-000000000004", // stock 0, 1 consumo sin puntuar
  sinPrivado: "10000000-0000-0000-0000-000000000005", // sin fila en wine_privado
};

export function filasSinteticas() {
  return {
    preferencias: {
      user_id: U, onboarding_status: "completed", wine_types_answer: "answered",
      preferred_wine_types: ["tinto"], exploration_open: true, preferred_grapes: ["malbec", "cabernet_franc"],
      knowledge_level: "intermediate", updated_at: "2026-11-15T10:00:00Z",
    },
    conocimiento: [
      { id: "k1", knowledge_type: "explicit", scope_type: "grape", scope_value: "torrontes", wine_id: null, wine_snapshot: null, meaning: "no le gusta el torrontés", value: { polaridad: "negativa" }, strength: "strong", source_type: "conversation", evidence: null, created_at: "2026-11-01T00:00:00Z" },
      { id: "k2", knowledge_type: "restriction", scope_type: "general", scope_value: null, wine_id: null, wine_snapshot: null, meaning: "sin alcohol los días de semana", value: null, strength: null, source_type: "conversation", evidence: null, created_at: "2026-11-01T00:00:00Z" },
      { id: "k3", knowledge_type: "inference", scope_type: "wine", scope_value: null, wine_id: W.favorito, wine_snapshot: { nombre: "Sintético Uno" }, meaning: "lo elige para asados", value: null, strength: "indication", source_type: "behavior", evidence: { consumos: ["c1", "c2"] }, created_at: "2026-11-01T00:00:00Z" },
    ],
    vinos: [
      { id: W.favorito, nombre: "Sintético Uno", bodega: "Bodega A", varietal: "Malbec", anada: 2020, region: "Mendoza", lugar: "Luján de Cuyo", maridaje: "Carnes rojas", created_at: "2026-10-01T00:00:00Z" },
      { id: W.stockSinTomar, nombre: "Sintético Dos", bodega: "Bodega B", varietal: "Cabernet Franc", anada: 2021, region: null, lugar: null, maridaje: null, created_at: "2026-10-05T00:00:00Z" },
      { id: W.tomadoMal, nombre: "Sintético Tres", bodega: "Bodega C", varietal: "Torrontés", anada: null, region: "Salta", lugar: "Cafayate", maridaje: "Empanadas", created_at: "2026-09-01T00:00:00Z" },
      { id: W.tomadoSinPuntuar, nombre: "Sintético Cuatro", bodega: null, varietal: "Pinot Noir", anada: 2019, region: null, lugar: null, maridaje: null, created_at: "2026-08-01T00:00:00Z" },
      { id: W.sinPrivado, nombre: "Sintético Cinco", bodega: null, varietal: null, anada: null, region: null, lugar: null, maridaje: null, created_at: "2026-07-01T00:00:00Z" },
    ],
    privados: [
      { wine_id: W.favorito, precio: "18000", stock: 2, favorito: true },
      { wine_id: W.stockSinTomar, precio: null, stock: 6, favorito: false },
      { wine_id: W.tomadoMal, precio: 9000, stock: 0, favorito: false },
      { wine_id: W.tomadoSinPuntuar, precio: null, stock: 0, favorito: false },
    ],
    consumos: [
      { id: "c1", wine_id: W.favorito, fecha: "2026-10-10T21:00:00Z", puntuacion: "4.5", comida: "Asado", comentario: "Muy rico" },
      { id: "c2", wine_id: W.favorito, fecha: "2026-11-01T21:00:00Z", puntuacion: 5, comida: "Bife", comentario: null },
      { id: "c3", wine_id: W.tomadoMal, fecha: "2026-09-10T21:00:00Z", puntuacion: 1.5, comida: "Pescado", comentario: "No me gustó" },
      { id: "c4", wine_id: W.tomadoMal, fecha: "2026-09-20T21:00:00Z", puntuacion: null, comida: null, comentario: null },
      { id: "c5", wine_id: W.tomadoSinPuntuar, fecha: "2026-08-10T21:00:00Z", puntuacion: null, comida: "Pastas", comentario: null },
    ],
  };
}

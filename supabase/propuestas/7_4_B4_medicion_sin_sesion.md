# Etapa 7.4-B4 — Medición de entradas y consultas sin stock que terminan sin sesión

**Estado: APLICADA LA OPCIÓN A (2026-11-23, rama `etapa7-4-medicion-sin-candidatos`).** Sin migración. Una consulta nueva que termina en `sin_candidatos` registra una sesión cerrada (`status = 'completed'`, `ended_at`), sin ítems y sin motor, con `context = { entrada, tanda: 0, revision: 1, temporal: { restricciones: [] }, resultado: 'sin_candidatos', motivo }`. La respuesta conserva `estado` y `motivo` y agrega `sesionId`; si el registro falla, la respuesta sale igual sin `sesionId`. Refinar y reservar sobre esa sesión responden `409 sesion_inactiva`; los eventos, `409 sesion_sin_recomendaciones`. La opción B no se aplicó.

**Conteo con la opción A:** entradas = sesiones `mode = 'cellar'` con `context->>'entrada' = 'elegir_de_mi_cava'`; entradas sin candidatos = las que además tienen `context->>'resultado' = 'sin_candidatos'`, desglosadas por `context->>'motivo'`; entradas con recomendación = el resto. Quedan fuera solo las entradas que fallaron antes de responder (red o 5xx) y las sin candidatos cuyo registro falló.

---

Texto original de la propuesta:

## Situación verificada

- `recommendation_events.session_id` es `NOT NULL` (migración `20261025000000`, §2.5). Todo evento necesita una sesión.
- Desde 7.4-B1, una **consulta nueva** que termina en `sin_candidatos` (`biblioteca_vacia`, `sin_stock`, `excluidos_por_restriccion`, `excluidos_por_reserva`) **no crea sesión**. Esa decisión fue aprobada: «no invoques el motor ni crees una sesión».
- Por lo tanto, hoy esas entradas **no quedan registradas en ningún lado**.

## Cómo se cuenta hoy (implementado en 7.4-B4, sin migración)

| Medida | Fuente | Qué cubre | Qué falta |
|---|---|---|---|
| Entradas al flujo con recomendación | `recommendation_sessions` con `mode = 'cellar'` y `context->>'entrada' = 'elegir_de_mi_cava'` (una por consulta nueva que generó la tanda 1) | Toda entrada que mostró al menos un vino | Las entradas que terminaron en `sin_candidatos` sin sesión, y las que fallaron (red, 5xx) |
| Tanda visible | `shown`, uno por ítem (`payload.tanda`) | Tandas efectivamente pintadas | — |
| Consulta sin stock **dentro** de una sesión (después de refinar o reservar) | `new_batch` con `payload.resultado = 'sin_candidatos'` y `payload.motivo = 'sin_stock'` | Sí | — |
| Consulta sin stock **al entrar** | — | **No se registra** | Todo |

## Alternativas

| | A. Sesión cerrada para la entrada sin candidatos (sin migración) | B. Tabla mínima de entradas (con migración) |
|---|---|---|
| Qué es | Al entrar y no haber candidatos, crear igual una `recommendation_sessions` con `status = 'completed'`, `ended_at = now()`, sin ítems, y `context = { entrada, tanda: 0, revision: 1, temporal: { restricciones: [] }, resultado: 'sin_candidatos', motivo }`. La respuesta incluye `sesionId`. | Nueva tabla `recommendation_entries (id, user_id, mode, resultado, motivo, session_id null, created_at)`, con escritura solo por `service_role` y lectura RLS propia. Una fila por cada entrada al flujo, con o sin sesión. |
| Migración | No | Sí (tabla + RLS + grants) |
| Cambia una decisión aprobada | **Sí**: revierte «sin sesión» de 7.4-B1 para este caso | No |
| Cómo se cuentan las entradas | Sesiones `cellar` con `context.entrada` | Filas de `recommendation_entries` |
| Cómo se cuentan las consultas sin stock al entrar | Sesiones con `context->>'motivo' = 'sin_stock'` | Filas con `motivo = 'sin_stock'` |
| Riesgo | Sesiones sin ítems mezcladas con las demás (se distinguen por `context.resultado`); el historial de sesiones crece | Tabla nueva que mantener; el conteo de entradas queda en un lugar distinto del resto de la medición |

**Recomendación:** A. No necesita migración y deja toda la medición en las tablas de 7.1. Se puede aplicar en un bloque chico (endpoint + pruebas) si se aprueba revertir la regla de 7.4-B1 para este caso.

**Lo que no cambia en ninguna alternativa:** los eventos `shown`, `selected`, `bottle_opened` y `new_batch` de 7.4-B4.

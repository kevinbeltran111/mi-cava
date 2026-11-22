# Etapa 7.3-B — Propuestas pendientes de autorización

**Estado: NO APLICADO.** Nada de este documento está implementado en la base ni habilitado en el código. `ESCRITURA_HABILITADA = false` en `api/_que-tomo/conocimiento/persistencia.js`.

Este documento existe porque estas dos decisiones cambian el contrato de datos y, en un caso, requieren una migración.

---

## 1. Contrato de `user_knowledge.value`

**Situación verificada en 7.1:** `value` es `jsonb` sin ninguna restricción. La polaridad («me gusta» / «no me gusta») no tiene columna propia. Los datos de prueba de 7.3-A usan `{"polaridad":"negativa"}`, pero eso no es un contrato aprobado.

**Efecto actual en 7.3-B:** la polaridad de un conocimiento explícito se informa como `pendiente_contrato_value`. Las contradicciones que dependen de ella se listan como `no_evaluable`, y las inferencias simuladas llevan `value: null` con `requiereContratoValue: true`.

**Alternativas:**

| | A. Contrato solo en el código | B. Contrato en la base |
|---|---|---|
| Qué es | Formato `{ "version": 1, "polaridad": "positiva" \| "negativa" }` validado por el código que escribe | El mismo formato, más un `CHECK` en `user_knowledge` que lo exija para `explicit` e `inference` |
| Migración | No | Sí (`ADD CONSTRAINT ... NOT VALID`, y luego `VALIDATE`) |
| Garantía | Depende de que todo escritor use el mismo módulo | La base rechaza filas mal formadas |
| Riesgo | Filas viejas o escritas por otro camino sin formato | Hay que revisar antes las filas existentes en Producción |

En los dos casos, **«No me recomiendes X» sigue siendo `restriction`**, no un `explicit` negativo. La restricción excluye; la preferencia negativa solo informa.

---

## 2. Persistencia de inferencias: unicidad, concurrencia, actualización, sustitución y revocación

**Lo que ya está resuelto en el código (simulación):**
- Clave lógica: `inference | behavior | scope_type | clave normalizada | wine_id`. Hay una sola inferencia activa por alcance; un cambio de polaridad provoca una sustitución.
- Operaciones: `insertar`, `actualizar` (solo la evidencia), `sustituir` (la vieja pasa a `superseded` y se inserta la nueva), `retirar` (`superseded` sin reemplazo) y `revocar` (`revoked`, solo por corrección del usuario).
- Nunca se borra nada (7.1 no da DELETE a `service_role`) y nunca se tocan filas `explicit`, `restriction` ni de otro `source_type`.
- `scope_value` se guarda normalizado (id del catálogo o clave de bodega), para que «Malbec» y «malbec» no se dupliquen.

**Lo que no se puede garantizar sin la base:**
1. **Unicidad ante escrituras concurrentes.** Dos consultas simultáneas pueden insertar la misma inferencia. Propuesta:
   ```sql
   create unique index uq_user_knowledge_inferencia_activa
     on public.user_knowledge (user_id, scope_type, coalesce(scope_value, ''), coalesce(wine_id::text, ''))
     where status = 'active' and knowledge_type = 'inference' and source_type = 'behavior';
   ```
   Con este índice, la segunda inserción falla con `23505`, y el código la trata como `sin_cambios` y vuelve a calcular.
2. **Atomicidad de la sustitución.** Hoy serían dos pedidos separados a PostgREST: actualizar la vieja e insertar la nueva. Hay dos opciones:
   - **2a.** Hacer los dos pasos en orden y de forma que repetirlos no cause problemas, aceptando que por un instante no haya ninguna inferencia activa. No requiere migración.
   - **2b.** Una función `SECURITY DEFINER`, ejecutable solo por `service_role`, que aplique el plan dentro de una transacción. Requiere migración y una revisión de seguridad, por los antecedentes de SEC-01.
3. **Antes de habilitar las escrituras** hace falta tener aprobadas, además, las reglas de fuerza validadas (`REGLAS_VALIDADAS`, hoy `null`) y el contrato de `value` del punto 1.

**Recomendación técnica:** índice del punto 1 con la opción 2a para la primera versión, con escrituras activadas por una variable de entorno y apagadas por defecto. La 2b solo si el uso real muestra conflictos.

Cualquiera de estas opciones requiere una autorización específica, un respaldo previo según `PROCEDIMIENTO_RESPALDO_V3.md` y pruebas sobre una base descartable antes de llegar a Producción.

-- =============================================================================
-- ETAPA 7.2-A: RESPUESTA A LA PREGUNTA DE TIPOS DEL ONBOARDING
-- =============================================================================
-- Agrega UNA columna a public.user_preferences y UNA restricción CHECK.
-- No modifica columnas, restricciones, triggers, policies ni privilegios
-- existentes, ni ninguna otra tabla. No toca filas existentes: la columna
-- nueva es NULL, sin default y sin reescritura de la tabla.
--
-- Problema que resuelve: con el esquema de 7.1, «No tengo preferencia
-- todavía» y «omití la pregunta» quedaban iguales
-- (preferred_wine_types = '{}' y exploration_open = false).
--
-- wine_types_answer — qué hizo el usuario con la pregunta de tipos
--
--   NULL            Pregunta todavía no respondida. Estado inicial de toda
--                   fila. También es el valor de las filas creadas antes de
--                   esta migración (en Producción no había ninguna al
--                   prepararla). Para no invalidar datos válidos en 7.1, NULL
--                   no impone condiciones sobre las otras columnas.
--   'skipped'       Omitida voluntariamente.
--                   Exige preferred_wine_types = '{}' y exploration_open = false.
--   'no_preference' Respuesta explícita «No tengo preferencia todavía».
--                   Exige preferred_wine_types = '{}' y exploration_open = false.
--   'answered'      Respondida con contenido: uno o varios tipos y/o
--                   «Me gusta probar de todo» (exploration_open = true).
--                   Exige al menos uno de los dos.
--
-- Ausencia de preferencia y apertura a explorar no se confunden:
-- 'no_preference' prohíbe exploration_open = true, y «Me gusta probar de
-- todo» solo existe como 'answered' + exploration_open = true.
--
-- Transiciones (las aplica la capa de persistencia del frontend,
-- src/onboarding/preferencias.js):
--   NULL                → skipped | no_preference | answered
--   entre valores no NULL, en cualquier sentido (Atrás, edición posterior)
--   no NULL → NULL      no se hace: la capa nunca escribe NULL en esta
--                       columna. La base no lo impide; ver riesgos de 7.2-A.
-- La columna es independiente de onboarding_status: cualquier valor puede
-- convivir con never / started / completed / skipped.
--
-- Acceso: la cubren los grants de tabla y las policies de 7.1
-- (authenticated: SELECT/INSERT/UPDATE de la propia fila; service_role:
-- SELECT). No se agregan grants por columna.
--
-- Requiere 20261025000000 (Etapa 7.1) aplicada.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.user_preferences') is null then
    raise exception 'Migración 20261110000000 no aplicada: falta public.user_preferences '
      '(aplicar antes 20261025000000).';
  end if;
  if exists (select 1 from pg_attribute
             where attrelid = 'public.user_preferences'::regclass
               and attname = 'wine_types_answer' and not attisdropped) then
    raise exception 'Migración 20261110000000 no aplicada: la columna '
      'user_preferences.wine_types_answer ya existe.';
  end if;
end;
$$;

alter table public.user_preferences
  add column wine_types_answer text;

alter table public.user_preferences
  add constraint user_preferences_wine_types_answer_check
  check (
    wine_types_answer is null
    or (wine_types_answer in ('skipped', 'no_preference')
        and cardinality(preferred_wine_types) = 0
        and exploration_open = false)
    or (wine_types_answer = 'answered'
        and (cardinality(preferred_wine_types) > 0 or exploration_open = true))
  );

comment on column public.user_preferences.wine_types_answer is
  'Pregunta de tipos del onboarding. NULL = todavía no respondida; '
  'skipped = omitida; no_preference = «No tengo preferencia todavía»; '
  'answered = tipos y/o «Me gusta probar de todo» (exploration_open).';

commit;

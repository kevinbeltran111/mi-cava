-- =============================================================================
-- REVERSIÓN DE 20261110000000 (Etapa 7.2-A: user_preferences.wine_types_answer)
-- =============================================================================
-- NO es una migración (no está en supabase/migrations). Se ejecuta a mano,
-- solo ante una falla y con autorización, DESPUÉS de volver el frontend a una
-- versión que no use la columna (el frontend publicado en ab925f6 no la usa).
--
-- Quita el CHECK y la columna nuevos. No toca nada más de 7.1 ni del baseline.
-- La columna guarda la respuesta a la pregunta de tipos; borrarla pierde ese
-- dato. Por eso aborta si hay filas con respuesta, salvo que en la MISMA
-- sesión se haya ejecutado antes:
--     set micava.revertir_con_datos = 'si';
-- (decisión explícita: tener el respaldo previo a mano).
--
-- Después, en Supabase, registrar la reversión en el historial con la CLI:
--     supabase migration repair --status reverted 20261110000000 \
--       --linked --project-ref <ref> --workdir <repo>
-- =============================================================================

begin;

do $$
declare
  n bigint;
begin
  if not exists (select 1 from pg_attribute
                 where attrelid = 'public.user_preferences'::regclass
                   and attname = 'wine_types_answer' and not attisdropped) then
    raise exception 'Reversión no aplicada: user_preferences.wine_types_answer no existe '
      '(la migración 20261110000000 no está aplicada).';
  end if;
  select count(*) into n from public.user_preferences where wine_types_answer is not null;
  if n > 0 and coalesce(current_setting('micava.revertir_con_datos', true), '') <> 'si' then
    raise exception 'Reversión no aplicada: % fila(s) tienen respuesta en wine_types_answer. '
      'Para descartarlas: set micava.revertir_con_datos = ''si''; en la misma sesión.', n;
  end if;
  raise notice 'Reversión 20261110000000: se descartan % respuesta(s).', n;
end;
$$;

alter table public.user_preferences
  drop constraint user_preferences_wine_types_answer_check;

alter table public.user_preferences
  drop column wine_types_answer;

commit;

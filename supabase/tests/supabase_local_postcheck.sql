-- =============================================================================
-- POSTCHECK — verifica que las pruebas no dejaron rastros
-- =============================================================================
-- Solo lectura. Variables de psql (las pasa run_supabase_local.ps1):
--   users_before  filas en auth.users antes de las pruebas
--   seq_last      last_value de public.analytics_alias_seq antes
--   seq_called    is_called de public.analytics_alias_seq antes
-- =============================================================================

\set ON_ERROR_STOP 1

begin transaction read only;

select set_config('etapa7.users_before', :'users_before', true) as _ub,
       set_config('etapa7.seq_last', :'seq_last', true) as _sl,
       set_config('etapa7.seq_called', :'seq_called', true) as _sc \gset

do $$
declare
  t text;
  n bigint;
  s record;
begin
  foreach t in array array['user_preferences', 'user_knowledge', 'recommendation_sessions',
                           'recommendation_items', 'recommendation_events', 'analytics_identity'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'POSTCHECK: public.% quedó con % filas', t, n;
    end if;
  end loop;
  if exists (select 1 from pg_namespace where nspname = 'tests') then
    raise exception 'POSTCHECK: quedó el esquema "tests"';
  end if;
  if (select count(*) from auth.users) <> current_setting('etapa7.users_before')::bigint then
    raise exception 'POSTCHECK: cambió la cantidad de filas de auth.users';
  end if;
  if exists (select 1 from public.wines where id in ('a1000000-0000-0000-0000-000000000001',
                                                     'a1000000-0000-0000-0000-000000000002',
                                                     'b1000000-0000-0000-0000-000000000001'))
     or exists (select 1 from public.profiles where id in ('00000000-0000-0000-0000-00000000000a',
                                                           '00000000-0000-0000-0000-00000000000b')) then
    raise exception 'POSTCHECK: quedaron datos ficticios';
  end if;
  select last_value, is_called into s from public.analytics_alias_seq;
  if s.last_value <> current_setting('etapa7.seq_last')::bigint
     or s.is_called <> current_setting('etapa7.seq_called')::boolean then
    raise exception 'POSTCHECK: la secuencia de alias no volvió a su estado (%, %)', s.last_value, s.is_called;
  end if;
  raise notice 'POSTCHECK OK: sin rastros';
end;
$$;

rollback;

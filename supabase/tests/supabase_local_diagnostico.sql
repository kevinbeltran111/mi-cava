-- =============================================================================
-- DIAGNOSTICO (solo lectura) - Supabase local, Etapa 7.1
-- =============================================================================
-- Para usar despues de una ejecucion interrumpida de run_supabase_local.ps1
-- (ventana cerrada, proceso terminado, Docker detenido, etc.).
-- No escribe nada: corre en una transaccion READ ONLY que termina en ROLLBACK.
--
-- Muestra:
--   * estado de public.analytics_alias_seq y filas de analytics_identity;
--   * filas de las seis tablas de Etapa 7;
--   * si quedo el esquema "tests" o datos ficticios de prueba;
--   * otras sesiones abiertas en la base y transacciones preparadas.
--
-- Interpretacion y pasos siguientes: supabase/README.md, seccion
-- "Ejecucion interrumpida".
-- Archivo solo ASCII para poder enviarlo por stdin desde PowerShell 5.1.
-- =============================================================================

\set ON_ERROR_STOP 1

begin transaction read only;

\echo '== Secuencia de alias'
select last_value, is_called,
       (select count(*) from public.analytics_identity) as filas_analytics_identity
from public.analytics_alias_seq;

\echo '== Filas en tablas de Etapa 7 (todas deberian ser 0)'
select 'user_preferences' as tabla, count(*) as filas from public.user_preferences
union all select 'user_knowledge', count(*) from public.user_knowledge
union all select 'recommendation_sessions', count(*) from public.recommendation_sessions
union all select 'recommendation_items', count(*) from public.recommendation_items
union all select 'recommendation_events', count(*) from public.recommendation_events
union all select 'analytics_identity', count(*) from public.analytics_identity;

\echo '== Restos de prueba (todo deberia ser false / 0)'
select exists (select 1 from pg_namespace where nspname = 'tests') as existe_esquema_tests,
       (select count(*) from auth.users
         where id in ('00000000-0000-0000-0000-00000000000a',
                      '00000000-0000-0000-0000-00000000000b')) as usuarios_ficticios,
       (select count(*) from public.wines
         where id in ('a1000000-0000-0000-0000-000000000001',
                      'a1000000-0000-0000-0000-000000000002',
                      'b1000000-0000-0000-0000-000000000001')) as vinos_ficticios,
       (select count(*) from auth.users) as filas_auth_users;

\echo '== Otras sesiones abiertas en esta base (no deberia haber una transaccion de pruebas activa)'
select pid, usename, application_name, state, xact_start,
       left(regexp_replace(query, '\s+', ' ', 'g'), 80) as query
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and backend_type = 'client backend'
order by xact_start nulls last;

\echo '== Transacciones preparadas (deberia estar vacio)'
select gid, prepared, owner from pg_prepared_xacts where database = current_database();

rollback;

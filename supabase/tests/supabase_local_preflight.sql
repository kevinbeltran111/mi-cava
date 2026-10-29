-- =============================================================================
-- PREFLIGHT — pruebas de Etapa 7 sobre Supabase LOCAL real (supabase start)
-- =============================================================================
-- Solo lectura: corre en una transacción READ ONLY que termina en ROLLBACK.
-- Aborta con error si la base no es la esperada o si no está en el estado
-- requerido para que las pruebas sean válidas y no dejen rastros.
--
-- La ejecuta run_supabase_local.ps1 antes de cualquier prueba.
-- =============================================================================

\set ON_ERROR_STOP 1
set client_min_messages = notice;

begin transaction read only;

do $$
declare
  v_versions text[];
  v_tables   text[] := array['user_preferences', 'user_knowledge', 'recommendation_sessions',
                             'recommendation_items', 'recommendation_events', 'analytics_identity'];
  t          text;
  n          bigint;
  r          record;
  v_role     text;
begin
  -- 1. Identidad de la base ----------------------------------------------------
  if current_database() <> 'postgres' then
    raise exception 'PREFLIGHT: base inesperada (%)', current_database();
  end if;
  if current_user <> 'postgres' then
    raise exception 'PREFLIGHT: usuario inesperado (%), se espera postgres', current_user;
  end if;
  if current_setting('server_version_num')::int < 170000 then
    raise exception 'PREFLIGHT: se requiere PostgreSQL 17 (es %)', current_setting('server_version');
  end if;
  -- Supabase real, no el shim: existen supabase_admin, authenticator y
  -- columnas de GoTrue en auth.users.
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin')
     or not exists (select 1 from pg_roles where rolname = 'authenticator')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'auth' and table_name = 'users'
                      and column_name = 'encrypted_password') then
    raise exception 'PREFLIGHT: esto no parece un Supabase real (¿shim?)';
  end if;

  -- 2. Migraciones aplicadas: exactamente las tres versionadas -------------------
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'PREFLIGHT: falta supabase_migrations.schema_migrations';
  end if;
  select array_agg(version::text order by version) into v_versions
  from supabase_migrations.schema_migrations;
  if v_versions is distinct from array['20261010000000', '20261010000001', '20261025000000'] then
    raise exception 'PREFLIGHT: historial de migraciones inesperado: %', v_versions;
  end if;

  -- 3. Estado limpio para que las pruebas sean válidas y reversibles -------------
  foreach t in array v_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'PREFLIGHT: falta public.%', t;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception 'PREFLIGHT: public.% tiene % filas; las pruebas requieren las tablas de Etapa 7 vacías', t, n;
    end if;
  end loop;
  if exists (select 1 from pg_namespace where nspname = 'tests') then
    raise exception 'PREFLIGHT: ya existe un esquema "tests"; las pruebas lo crean y no deben pisar uno existente';
  end if;
  if exists (select 1 from auth.users where id in ('00000000-0000-0000-0000-00000000000a',
                                                   '00000000-0000-0000-0000-00000000000b'))
     or exists (select 1 from public.profiles where id in ('00000000-0000-0000-0000-00000000000a',
                                                           '00000000-0000-0000-0000-00000000000b'))
     or exists (select 1 from public.wines where id in ('a1000000-0000-0000-0000-000000000001',
                                                        'a1000000-0000-0000-0000-000000000002',
                                                        'b1000000-0000-0000-0000-000000000001')) then
    raise exception 'PREFLIGHT: los UUID ficticios de prueba ya existen en la base';
  end if;

  -- 4. Capacidades que las pruebas necesitan ------------------------------------
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not pg_has_role('postgres', v_role, 'SET') then
      raise exception 'PREFLIGHT: postgres no puede hacer SET ROLE %', v_role;
    end if;
  end loop;
  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'PREFLIGHT: service_role no tiene BYPASSRLS';
  end if;
  if not has_table_privilege('auth.users', 'INSERT')
     or not has_table_privilege('auth.users', 'DELETE') then
    raise exception 'PREFLIGHT: postgres no puede insertar/borrar en auth.users';
  end if;
  -- auth.uid() lee el JWT como lo simulan las pruebas (set_config local, sin escritura)
  perform set_config('request.jwt.claims',
                     '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000000a"}', true);
  if auth.uid() is distinct from '00000000-0000-0000-0000-00000000000a'::uuid then
    raise exception 'PREFLIGHT: auth.uid() no lee request.jwt.claims como se espera';
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- 5. Información (no aborta) --------------------------------------------------
  raise notice 'PREFLIGHT: %', version();
  select rolsuper, rolbypassrls into r from pg_roles where rolname = 'postgres';
  raise notice 'PREFLIGHT: postgres superuser=% bypassrls=%', r.rolsuper, r.rolbypassrls;
  raise notice 'PREFLIGHT: filas en auth.users=%', (select count(*) from auth.users);
  for r in
    select c.relname as obj, pg_get_userbyid(c.relowner) as owner
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tables)
    union all
    select p.proname, pg_get_userbyid(p.proowner)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'intel\_%'
    order by 1
  loop
    raise notice 'PREFLIGHT: dueño % = %', r.obj, r.owner;
  end loop;
  if exists (select 1 from pg_proc
             where pronamespace = 'public'::regnamespace and position(E'\r' in prosrc) > 0) then
    raise notice 'PREFLIGHT: hay funciones con CRLF en su cuerpo (checkout Windows); la huella lo normaliza';
  end if;

  raise notice 'PREFLIGHT OK';
end;
$$;

rollback;

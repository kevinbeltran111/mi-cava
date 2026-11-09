-- =============================================================================
-- PRUEBAS — ETAPA 7 / FASE 7.1 (modelo de datos de Inteligencia)
-- =============================================================================
-- Corre como superusuario sobre una base DESCARTABLE con el shim local, los
-- baselines y la migración 20261025000000 aplicados (ver run_local.sh).
-- Cambia de rol (anon / authenticated / service_role) y de JWT para cada caso.
-- Crea datos de prueba; nunca ejecutar sobre una base real.
-- Termina con error si alguna prueba falla.
-- =============================================================================

\set ON_ERROR_STOP 1
set client_min_messages = warning;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create table tests.results (
  n      serial primary key,
  grupo  text not null,
  label  text not null,
  ok     boolean not null,
  detail text
);
grant insert on tests.results to anon, authenticated, service_role;
grant usage on sequence tests.results_n_seq to anon, authenticated, service_role;

-- Usuarios de prueba
--   A = 00000000-0000-0000-0000-00000000000a
--   B = 00000000-0000-0000-0000-00000000000b
create function tests.uid(c text) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-0000-00000000000' || c)::uuid $$;

-- Cambia a un rol de la API con el JWT correspondiente.
create function tests.switch(p_role text, p_uid uuid) returns void
 language plpgsql
as $$
begin
  if p_role = 'postgres' then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return;
  end if;
  perform set_config('request.jwt.claims',
    case when p_uid is null then json_build_object('role', p_role)::text
         else json_build_object('role', p_role, 'sub', p_uid)::text end, true);
  execute format('set local role %I', p_role);
end;
$$;

create function tests.record(g text, l text, ok boolean, d text) returns void
 language sql
as $$ insert into tests.results (grupo, label, ok, detail) values (g, l, ok, d) $$;

-- La sentencia debe ejecutarse sin error.
create function tests.ok(g text, l text, p_role text, p_uid uuid, p_sql text)
 returns void language plpgsql
as $$
begin
  perform tests.switch(p_role, p_uid);
  begin
    execute p_sql;
  exception when others then
    perform tests.switch('postgres', null);
    perform tests.record(g, l, false, 'error inesperado ' || sqlstate || ': ' || sqlerrm);
    return;
  end;
  perform tests.switch('postgres', null);
  perform tests.record(g, l, true, null);
end;
$$;

-- La sentencia debe fallar con uno de los SQLSTATE esperados.
create function tests.fails(g text, l text, p_role text, p_uid uuid, p_sql text, p_states text[])
 returns void language plpgsql
as $$
declare st text; msg text;
begin
  perform tests.switch(p_role, p_uid);
  begin
    execute p_sql;
  exception when others then
    st := sqlstate; msg := sqlerrm;
    perform tests.switch('postgres', null);
    perform tests.record(g, l, st = any (p_states), st || ': ' || msg);
    return;
  end;
  perform tests.switch('postgres', null);
  perform tests.record(g, l, false, 'no falló (se esperaba ' || array_to_string(p_states, '/') || ')');
end;
$$;

-- p_sql devuelve un número; debe ser igual al esperado.
create function tests.eq(g text, l text, p_role text, p_uid uuid, p_sql text, p_expected bigint)
 returns void language plpgsql
as $$
declare v bigint;
begin
  perform tests.switch(p_role, p_uid);
  begin
    execute p_sql into v;
  exception when others then
    perform tests.switch('postgres', null);
    perform tests.record(g, l, false, 'error ' || sqlstate || ': ' || sqlerrm);
    return;
  end;
  perform tests.switch('postgres', null);
  perform tests.record(g, l, v is not distinct from p_expected,
                       'obtenido ' || coalesce(v::text, 'NULL') || ', esperado ' || p_expected);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- SQLSTATE usados: 42501 = permiso denegado / violación de RLS;
-- 23514 = check; 23503 = FK; 23505 = unique.


-- -----------------------------------------------------------------------------
-- 1. ESQUEMA
-- -----------------------------------------------------------------------------
do $$
declare t text;
  tabs text[] := array['user_preferences','user_knowledge','recommendation_sessions',
                       'recommendation_items','recommendation_events','analytics_identity'];
begin
  foreach t in array tabs loop
    perform tests.record('esquema', t || ' existe', to_regclass('public.' || t) is not null, null);
    perform tests.record('esquema', t || ' RLS habilitado',
      (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), null);
  end loop;
end $$;

-- Matriz exacta de privilegios esperados
do $$
declare
  r record;
  got text;
  expected jsonb := '{
    "user_preferences":        {"anon":"", "authenticated":"INSERT,SELECT,UPDATE", "service_role":"SELECT"},
    "user_knowledge":          {"anon":"", "authenticated":"SELECT", "service_role":"INSERT,SELECT,UPDATE"},
    "recommendation_sessions": {"anon":"", "authenticated":"SELECT", "service_role":"INSERT,SELECT,UPDATE"},
    "recommendation_items":    {"anon":"", "authenticated":"SELECT", "service_role":"INSERT,SELECT"},
    "recommendation_events":   {"anon":"", "authenticated":"SELECT", "service_role":"INSERT,SELECT"},
    "analytics_identity":      {"anon":"", "authenticated":"", "service_role":"INSERT,SELECT"}
  }';
begin
  for r in
    select t.key as tab, g.key as grantee, g.value #>> '{}' as want
    from jsonb_each(expected) t, jsonb_each(t.value) g
  loop
    select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') into got
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = r.tab and grantee = r.grantee;
    perform tests.record('privilegios', r.tab || ' → ' || r.grantee, got = r.want,
                         'obtenido [' || got || '] esperado [' || r.want || ']');
  end loop;
  perform tests.record('privilegios', 'PUBLIC sin privilegios sobre tablas nuevas',
    not exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and grantee = 'PUBLIC'
                  and table_name in ('user_preferences','user_knowledge','recommendation_sessions',
                                     'recommendation_items','recommendation_events','analytics_identity')), null);
  perform tests.record('privilegios', 'columnas: sin grants por columna',
    not exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                where c.relnamespace = 'public'::regnamespace and a.attacl is not null
                  and c.relname in ('user_preferences','user_knowledge','recommendation_sessions',
                                    'recommendation_items','recommendation_events','analytics_identity')), null);
  perform tests.record('privilegios', 'secuencia de alias: solo service_role USAGE',
    has_sequence_privilege('service_role', 'public.analytics_alias_seq', 'usage')
    and not has_sequence_privilege('authenticated', 'public.analytics_alias_seq', 'usage')
    and not has_sequence_privilege('anon', 'public.analytics_alias_seq', 'usage'), null);
  perform tests.record('privilegios', 'funciones intel_*: sin EXECUTE para la API',
    not exists (select 1 from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname like 'intel\_%'
                  and (has_function_privilege('anon', p.oid, 'execute')
                       or has_function_privilege('authenticated', p.oid, 'execute')
                       or has_function_privilege('service_role', p.oid, 'execute'))), null);
  perform tests.record('privilegios', 'SECURITY DEFINER: solo intel_check_wine_owner',
    (select array_agg(proname::text order by proname) from pg_proc
      where pronamespace = 'public'::regnamespace and proname like 'intel\_%' and prosecdef)
    = array['intel_check_wine_owner'], null);
  perform tests.record('privilegios', 'intel_check_wine_owner: devuelve trigger, dueño postgres, sin args',
    exists (select 1 from pg_proc
            where oid = 'public.intel_check_wine_owner()'::regprocedure
              and prorettype = 'trigger'::regtype and pronargs = 0
              and proowner = 'postgres'::regrole), null);
  perform tests.record('privilegios', 'intel_check_wine_owner: sin EXECUTE para PUBLIC/anon/authenticated/service_role',
    not has_function_privilege('anon', 'public.intel_check_wine_owner()', 'execute')
    and not has_function_privilege('authenticated', 'public.intel_check_wine_owner()', 'execute')
    and not has_function_privilege('service_role', 'public.intel_check_wine_owner()', 'execute')
    and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = 'public.intel_check_wine_owner()'::regprocedure and a.grantee = 0), null);
  perform tests.record('privilegios', 'funciones intel_*: search_path fijado',
    not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
                and proname like 'intel\_%' and proconfig is null), null);
end $$;

-- Policies esperadas: todas para authenticated, ninguna para anon/public
do $$
begin
  perform tests.record('policies', 'cantidad de policies Etapa 7 = 7',
    (select count(*) from pg_policies where schemaname = 'public'
       and tablename in ('user_preferences','user_knowledge','recommendation_sessions',
                         'recommendation_items','recommendation_events','analytics_identity')) = 7, null);
  perform tests.record('policies', 'todas TO authenticated',
    not exists (select 1 from pg_policies where schemaname = 'public'
       and tablename in ('user_preferences','user_knowledge','recommendation_sessions',
                         'recommendation_items','recommendation_events','analytics_identity')
       and roles <> '{authenticated}'), null);
  perform tests.record('policies', 'analytics_identity sin policies',
    not exists (select 1 from pg_policies where tablename = 'analytics_identity'), null);
  perform tests.record('policies', 'usan (select auth.uid())',
    not exists (select 1 from pg_policies where schemaname = 'public'
       and tablename in ('user_preferences','user_knowledge','recommendation_sessions',
                         'recommendation_items','recommendation_events')
       and coalesce(qual, '') || coalesce(with_check, '') !~ 'SELECT auth\.uid\(\)'), null);
end $$;


-- -----------------------------------------------------------------------------
-- 2. DATOS DE PRUEBA (como postgres)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  (tests.uid('a'), 'a@test.local'), (tests.uid('b'), 'b@test.local');
insert into public.profiles (id, nombre, role) values
  (tests.uid('a'), 'Usuario A', 'editor'), (tests.uid('b'), 'Usuario B', 'viewer');
insert into public.wines (id, nombre, bodega, varietal, user_id) values
  ('a1000000-0000-0000-0000-000000000001', 'Vino A1', 'Bodega A', 'Malbec', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', 'Vino A2', 'Bodega A', 'Syrah',  tests.uid('a')),
  ('b1000000-0000-0000-0000-000000000001', 'Vino B1', 'Bodega B', 'Bonarda', tests.uid('b'));


-- -----------------------------------------------------------------------------
-- 3. user_preferences — escritura por el propio usuario
-- -----------------------------------------------------------------------------
select tests.ok('prefs', 'A crea su fila', 'authenticated', tests.uid('a'),
  $$insert into public.user_preferences (user_id, preferred_wine_types, preferred_grapes,
      exploration_open, knowledge_level, onboarding_status, onboarding_step)
    values ('00000000-0000-0000-0000-00000000000a', '{tinto,naranjo}', '{Malbec}', true,
            'intermediate', 'started', 2)$$);
select tests.fails('prefs', 'skipped sin onboarding_resolved_at', 'authenticated', tests.uid('b'),
  $$insert into public.user_preferences (user_id, onboarding_status) values
    ('00000000-0000-0000-0000-00000000000b', 'skipped')$$, array['23514']);
select tests.fails('prefs', 'never con onboarding_resolved_at', 'authenticated', tests.uid('b'),
  $$insert into public.user_preferences (user_id, onboarding_status, onboarding_resolved_at) values
    ('00000000-0000-0000-0000-00000000000b', 'never', now())$$, array['23514']);
select tests.ok('prefs', 'B (viewer) crea su fila', 'authenticated', tests.uid('b'),
  $$insert into public.user_preferences (user_id, onboarding_status, onboarding_resolved_at) values
    ('00000000-0000-0000-0000-00000000000b', 'skipped', now())$$);
select tests.fails('prefs', 'A no crea fila a nombre de B', 'authenticated', tests.uid('a'),
  $$insert into public.user_preferences (user_id) values ('00000000-0000-0000-0000-00000000000b')$$,
  array['42501','23505']);
select tests.eq('prefs', 'A no actualiza la fila de B (0 filas)', 'authenticated', tests.uid('a'),
  $$with u as (update public.user_preferences set exploration_open = true
     where user_id = '00000000-0000-0000-0000-00000000000b' returning 1) select count(*) from u$$, 0);
select tests.fails('prefs', 'A no reasigna su fila a B', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set user_id = '00000000-0000-0000-0000-00000000000b'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['42501','23505']);
select tests.ok('prefs', 'A completa onboarding', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set onboarding_status = 'completed', onboarding_step = 5,
      onboarding_resolved_at = now() where user_id = '00000000-0000-0000-0000-00000000000a'$$);
select tests.fails('prefs', 'A no borra su fila (sin DELETE)', 'authenticated', tests.uid('a'),
  $$delete from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['42501']);
select tests.fails('prefs', 'anon no inserta', 'anon', null,
  $$insert into public.user_preferences (user_id) values ('00000000-0000-0000-0000-00000000000a')$$, array['42501']);
select tests.fails('prefs', 'service_role no escribe preferencias', 'service_role', null,
  $$update public.user_preferences set exploration_open = false$$, array['42501']);

-- timestamps los fija la base
select tests.ok('prefs', 'A intenta forjar created_at', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set created_at = '2000-01-01', updated_at = '2000-01-01'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$);
select tests.eq('prefs', 'created_at/updated_at no forjables', 'postgres', null,
  $$select count(*) from public.user_preferences
     where created_at < '2020-01-01' or updated_at < '2020-01-01'$$, 0);

-- vocabularios y valores
select tests.fails('prefs', 'tipo de vino inválido (dulce)', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set preferred_wine_types = '{tinto,dulce}'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.ok('prefs', 'los 5 tipos aprobados', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set preferred_wine_types = '{tinto,blanco,rosado,naranjo,espumoso}'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$);
select tests.fails('prefs', 'NULL dentro de tipos', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set preferred_wine_types = array['tinto', null]
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'cepa vacía', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set preferred_grapes = '{Malbec,""}'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'knowledge_level inválido', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set knowledge_level = 'experto'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'onboarding_status inválido', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set onboarding_status = 'done'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'onboarding_step negativo', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set onboarding_step = -1
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'started con onboarding_resolved_at', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set onboarding_status = 'started'
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);
select tests.fails('prefs', 'completed sin onboarding_resolved_at', 'authenticated', tests.uid('a'),
  $$update public.user_preferences set onboarding_resolved_at = null
    where user_id = '00000000-0000-0000-0000-00000000000a'$$, array['23514']);


-- -----------------------------------------------------------------------------
-- 4. user_knowledge — solo server-side
-- -----------------------------------------------------------------------------
select tests.fails('knowledge', 'A no fabrica una inferencia', 'authenticated', tests.uid('a'),
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type, evidence)
    values ('00000000-0000-0000-0000-00000000000a', 'inference', 'general', 'likes_bold', 'recommender', '{"x":1}')$$,
  array['42501']);
select tests.fails('knowledge', 'A no fabrica conocimiento explícito', 'authenticated', tests.uid('a'),
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'conversation')$$,
  array['42501']);

select tests.ok('knowledge', 'service_role: explícito general', 'service_role', null,
  $$insert into public.user_knowledge (id, user_id, knowledge_type, scope_type, meaning, source_type)
    values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
            'explicit', 'general', 'prefers_low_alcohol', 'onboarding')$$);
-- "Ese vino lo guardo para ocasiones especiales" → conocimiento estructurado sobre el vino
select tests.ok('knowledge', 'service_role: vino reservado para ocasiones', 'service_role', null,
  $$insert into public.user_knowledge (id, user_id, knowledge_type, scope_type, wine_id, wine_snapshot,
      meaning, value, source_type, evidence)
    values ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a',
            'explicit', 'wine', 'a1000000-0000-0000-0000-000000000001',
            '{"nombre":"Vino A1","bodega":"Bodega A","varietal":"Malbec"}',
            'reserved_for_special_occasion', '{"occasion":"special"}', 'conversation',
            '{"utterance":"Ese vino lo guardo para ocasiones especiales"}')$$);
select tests.ok('knowledge', 'service_role: restricción de cepa', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, scope_value, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'restriction', 'grape', 'Syrah', 'avoid', 'conversation')$$);
select tests.ok('knowledge', 'service_role: inferencia con evidencia', 'service_role', null,
  $$insert into public.user_knowledge (id, user_id, knowledge_type, scope_type, scope_value, meaning,
      strength, source_type, evidence)
    values ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a',
            'inference', 'wine_type', 'tinto', 'prefers', 'relevant', 'behavior',
            '{"consumo_ids":["x","y"],"rule":"repeat_open"}')$$);
select tests.ok('knowledge', 'service_role: conocimiento de B', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, scope_value, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000b', 'explicit', 'winery', 'Bodega B', 'likes', 'onboarding')$$);

select tests.fails('knowledge', 'inferencia sin evidencia', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'inference', 'general', 'x', 'behavior')$$, array['23514']);
select tests.fails('knowledge', 'inferencia con evidencia {}', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type, evidence)
    values ('00000000-0000-0000-0000-00000000000a', 'inference', 'general', 'x', 'behavior', '{}')$$, array['23514']);
select tests.fails('knowledge', 'scope wine sin wine_id al crear', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, wine_snapshot, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'wine', '{"nombre":"x"}', 'x', 'conversation')$$,
  array['23514']);
select tests.fails('knowledge', 'scope wine sin snapshot', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, wine_id, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'wine',
            'a1000000-0000-0000-0000-000000000001', 'x', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'wine_id en scope general', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, wine_id, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general',
            'a1000000-0000-0000-0000-000000000001', 'x', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'scope_value en general', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, scope_value, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'x', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'wine_type fuera de vocabulario', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, scope_value, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'wine_type', 'dulce', 'x', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'grape sin scope_value', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'grape', 'x', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'meaning vacío', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', '  ', 'conversation')$$, array['23514']);
select tests.fails('knowledge', 'source_type inválido (consumption)', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'consumption')$$, array['23514']);
select tests.fails('knowledge', 'knowledge_type inválido', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'guess', 'general', 'x', 'behavior')$$, array['23514']);
select tests.fails('knowledge', 'strength numérico rechazado', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type, strength)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'behavior', '0.8')$$, array['23514']);
select tests.fails('knowledge', 'strength fuera de vocabulario', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type, strength)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'behavior', 'weak')$$, array['23514']);
select tests.ok('knowledge', 'strength: indication/relevant/strong y NULL', 'postgres', null,
  $o$do $d$ begin
      insert into public.user_knowledge (user_id, knowledge_type, scope_type, meaning, source_type, strength)
      select '00000000-0000-0000-0000-00000000000a', 'explicit', 'general', 'x', 'behavior', v
      from unnest(array['indication','relevant','strong', null]) v;
      raise exception 'rollback' using errcode = 'P0002';
    exception when sqlstate 'P0002' then null; end $d$$o$);
select tests.ok('knowledge', 'service_role: sustituir (status superseded)', 'service_role', null,
  $$update public.user_knowledge set status = 'superseded' where id = 'c0000000-0000-0000-0000-000000000001'$$);
select tests.fails('knowledge', 'status inválido', 'service_role', null,
  $$update public.user_knowledge set status = 'deleted' where id = 'c0000000-0000-0000-0000-000000000001'$$, array['23514']);
select tests.fails('knowledge', 'no se cambia user_id', 'service_role', null,
  $$update public.user_knowledge set user_id = '00000000-0000-0000-0000-00000000000b'
    where id = 'c0000000-0000-0000-0000-000000000001'$$, array['23514']);
select tests.fails('knowledge', 'no se reasigna wine_id', 'service_role', null,
  $$update public.user_knowledge set wine_id = 'a1000000-0000-0000-0000-000000000002'
    where id = 'c0000000-0000-0000-0000-000000000002'$$, array['23514']);
select tests.fails('knowledge', 'service_role no borra conocimiento', 'service_role', null,
  $$delete from public.user_knowledge where id = 'c0000000-0000-0000-0000-000000000001'$$, array['42501']);
select tests.fails('knowledge', 'A no altera conocimiento', 'authenticated', tests.uid('a'),
  $$update public.user_knowledge set status = 'revoked'$$, array['42501']);
select tests.fails('knowledge', 'A no borra conocimiento', 'authenticated', tests.uid('a'),
  $$delete from public.user_knowledge$$, array['42501']);


-- -----------------------------------------------------------------------------
-- 5. Sesiones, items y eventos — solo server-side
-- -----------------------------------------------------------------------------
select tests.fails('telemetría', 'A no crea sesión', 'authenticated', tests.uid('a'),
  $$insert into public.recommendation_sessions (user_id, mode)
    values ('00000000-0000-0000-0000-00000000000a', 'food')$$, array['42501']);

select tests.ok('sesiones', 'service_role crea sesión de A', 'service_role', null,
  $$insert into public.recommendation_sessions (id, user_id, mode, initial_input, context,
      context_sufficiency, questions_count, engine_version, model)
    values ('5a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
            'food', 'asado con amigos', '{"food":"asado"}', 'sufficient', 1, 'v1', 'test-model')$$);
select tests.ok('sesiones', 'service_role crea sesión de B', 'service_role', null,
  $$insert into public.recommendation_sessions (id, user_id, mode)
    values ('5b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'discovery')$$);
select tests.ok('sesiones', 'service_role crea segunda sesión de A', 'service_role', null,
  $$insert into public.recommendation_sessions (id, user_id, mode)
    values ('5a000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'cellar')$$);
select tests.fails('sesiones', 'mode inválido', 'service_role', null,
  $$insert into public.recommendation_sessions (user_id, mode)
    values ('00000000-0000-0000-0000-00000000000a', 'party')$$, array['23514']);
select tests.fails('sesiones', 'context_sufficiency inválido', 'service_role', null,
  $$insert into public.recommendation_sessions (user_id, mode, context_sufficiency)
    values ('00000000-0000-0000-0000-00000000000a', 'food', 'full')$$, array['23514']);
select tests.fails('sesiones', 'context no-objeto', 'service_role', null,
  $$insert into public.recommendation_sessions (user_id, mode, context)
    values ('00000000-0000-0000-0000-00000000000a', 'food', '[1]')$$, array['23514']);
select tests.fails('sesiones', 'completed sin ended_at', 'service_role', null,
  $$update public.recommendation_sessions set status = 'completed'
    where id = '5a000000-0000-0000-0000-000000000002'$$, array['23514']);
select tests.fails('sesiones', 'status inválido', 'service_role', null,
  $$update public.recommendation_sessions set status = 'closed', ended_at = now()
    where id = '5a000000-0000-0000-0000-000000000002'$$, array['23514']);
select tests.fails('sesiones', 'questions_count negativo', 'service_role', null,
  $$update public.recommendation_sessions set questions_count = -1
    where id = '5a000000-0000-0000-0000-000000000002'$$, array['23514']);
select tests.ok('sesiones', 'service_role cierra sesión', 'service_role', null,
  $$update public.recommendation_sessions set status = 'completed', ended_at = now()
    where id = '5a000000-0000-0000-0000-000000000001'$$);
select tests.fails('sesiones', 'service_role no borra sesiones', 'service_role', null,
  $$delete from public.recommendation_sessions where id = '5a000000-0000-0000-0000-000000000002'$$, array['42501']);

-- items
select tests.fails('telemetría', 'A no crea item', 'authenticated', tests.uid('a'),
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 1, 1, 'known', '{"nombre":"x"}')$$, array['42501']);
select tests.ok('items', 'item owned', 'service_role', null,
  $$insert into public.recommendation_items (id, session_id, batch_no, position, relationship, wine_id,
      wine_identity, signals)
    values ('1a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 1, 1, 'owned',
            'a1000000-0000-0000-0000-000000000001', '{"nombre":"Vino A1","bodega":"Bodega A"}',
            '{"reasons":["maridaje"]}')$$);
select tests.ok('items', 'item known sin wine_id', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 1, 2, 'known', '{"nombre":"Vino conocido"}')$$);
select tests.ok('items', 'item new externo con precio', 'service_role', null,
  $$insert into public.recommendation_items (id, session_id, batch_no, position, relationship,
      wine_identity, external_vintage, price_min, price_max, currency, grounding)
    values ('1a000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000001', 1, 3, 'new',
            '{"nombre":"Externo","bodega":"Otra"}', 2021, 10000, 15000, 'ARS',
            '{"sources":[{"url":"https://example.test"}]}')$$);
select tests.ok('items', 'item en sesión de B', 'service_role', null,
  $$insert into public.recommendation_items (id, session_id, batch_no, position, relationship, wine_identity)
    values ('1b000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 1, 1, 'new',
            '{"nombre":"Externo B"}')$$);
select tests.ok('items', 'segunda tanda', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 2, 1, 'new', '{"nombre":"Otro"}')$$);
select tests.fails('items', 'slot duplicado (sesión, tanda, posición)', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 1, 1, 'new', '{"nombre":"x"}')$$, array['23505']);
select tests.fails('items', 'batch_no 0', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 0, 1, 'new', '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'posición 4', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 4, 'new', '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'posición 0', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 0, 'new', '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'precio negativo', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity,
      price_min, currency) values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', '{"nombre":"x"}', -1, 'ARS')$$,
  array['23514']);
select tests.fails('items', 'precio mínimo > máximo', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity,
      price_min, price_max, currency)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', '{"nombre":"x"}', 20, 10, 'ARS')$$, array['23514']);
select tests.fails('items', 'precio sin moneda', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity, price_max)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', '{"nombre":"x"}', 10)$$, array['23514']);
select tests.fails('items', 'moneda no ISO', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity,
      price_max, currency) values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', '{"nombre":"x"}', 10, 'ars')$$,
  array['23514']);
select tests.fails('items', 'relationship inválida', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'maybe', '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'new con wine_id propio', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_id, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', 'a1000000-0000-0000-0000-000000000002',
            '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'new sin identidad del vino', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'new', '{"bodega":"sin nombre"}')$$, array['23514']);
select tests.fails('items', 'owned sin wine_id al crear', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 3, 1, 'owned', '{"nombre":"x"}')$$, array['23514']);
select tests.fails('items', 'service_role no modifica items (snapshot)', 'service_role', null,
  $$update public.recommendation_items set position = 3 where id = '1a000000-0000-0000-0000-000000000001'$$,
  array['42501']);

-- eventos
select tests.fails('telemetría', 'A no fabrica eventos', 'authenticated', tests.uid('a'),
  $$insert into public.recommendation_events (session_id, event_type)
    values ('5a000000-0000-0000-0000-000000000001', 'thumbs_up')$$, array['42501']);
select tests.ok('eventos', 'service_role registra eventos', 'service_role', null,
  $$insert into public.recommendation_events (id, session_id, recommendation_item_id, event_type, payload) values
    ('e0000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001',
     '1a000000-0000-0000-0000-000000000001', 'shown', '{}'),
    ('e0000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000001',
     '1a000000-0000-0000-0000-000000000001', 'thumbs_up', '{}'),
    ('e0000000-0000-0000-0000-000000000003', '5a000000-0000-0000-0000-000000000001', null, 'new_batch', '{}'),
    ('e0000000-0000-0000-0000-000000000004', '5a000000-0000-0000-0000-000000000001',
     '1a000000-0000-0000-0000-000000000003', 'cheaper_requested', '{"from":15000}')$$);
select tests.ok('eventos', 'los 9 tipos aprobados', 'service_role', null,
  $$insert into public.recommendation_events (session_id, event_type)
    select '5a000000-0000-0000-0000-000000000002', t
    from unnest(array['shown','selected','dismissed','cheaper_requested','bolder_requested',
                      'new_batch','thumbs_up','thumbs_down','bottle_opened']) t$$);
select tests.ok('eventos', 'service_role evento en sesión de B', 'service_role', null,
  $$insert into public.recommendation_events (session_id, recommendation_item_id, event_type)
    values ('5b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'shown')$$);
select tests.fails('eventos', 'event_type fuera de lista', 'service_role', null,
  $$insert into public.recommendation_events (session_id, event_type)
    values ('5a000000-0000-0000-0000-000000000001', 'shared')$$, array['23514']);
select tests.fails('eventos', 'item de otra sesión', 'service_role', null,
  $$insert into public.recommendation_events (session_id, recommendation_item_id, event_type)
    values ('5a000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'selected')$$,
  array['23503']);
select tests.fails('eventos', 'payload no-objeto', 'service_role', null,
  $$insert into public.recommendation_events (session_id, event_type, payload)
    values ('5a000000-0000-0000-0000-000000000001', 'shown', '"x"')$$, array['23514']);
select tests.fails('eventos', 'service_role no modifica eventos', 'service_role', null,
  $$update public.recommendation_events set event_type = 'thumbs_down'
    where id = 'e0000000-0000-0000-0000-000000000002'$$, array['42501']);
select tests.fails('eventos', 'service_role no borra eventos', 'service_role', null,
  $$delete from public.recommendation_events where id = 'e0000000-0000-0000-0000-000000000002'$$, array['42501']);
select tests.fails('eventos', 'append-only también para el dueño (postgres)', 'postgres', null,
  $$update public.recommendation_events set payload = '{"x":1}'
    where id = 'e0000000-0000-0000-0000-000000000002'$$, array['42501']);


-- -----------------------------------------------------------------------------
-- 5b. PERTENENCIA wine_id ↔ usuario (trigger SECURITY DEFINER)
-- -----------------------------------------------------------------------------
select tests.fails('pertenencia', 'conocimiento de A con vino de B', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, wine_id, wine_snapshot,
      meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'wine',
            'b1000000-0000-0000-0000-000000000001', '{"nombre":"Vino B1"}', 'likes', 'conversation')$$,
  array['23514']);
select tests.fails('pertenencia', 'item owned en sesión de A con vino de B', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_id, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 4, 1, 'owned',
            'b1000000-0000-0000-0000-000000000001', '{"nombre":"Vino B1"}')$$, array['23514']);
select tests.fails('pertenencia', 'item known en sesión de A con vino de B', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_id, wine_identity)
    values ('5a000000-0000-0000-0000-000000000001', 4, 1, 'known',
            'b1000000-0000-0000-0000-000000000001', '{"nombre":"Vino B1"}')$$, array['23514']);
select tests.fails('pertenencia', 'conocimiento con wine_id inexistente', 'service_role', null,
  $$insert into public.user_knowledge (user_id, knowledge_type, scope_type, wine_id, wine_snapshot,
      meaning, source_type)
    values ('00000000-0000-0000-0000-00000000000a', 'explicit', 'wine',
            'ffffffff-0000-0000-0000-000000000000', '{"nombre":"x"}', 'likes', 'conversation')$$,
  array['23514','23503']);
select tests.fails('pertenencia', 'mover item con vino de A a sesión de B (dueño)', 'postgres', null,
  $$update public.recommendation_items set session_id = '5b000000-0000-0000-0000-000000000001', batch_no = 9
    where id = '1a000000-0000-0000-0000-000000000001'$$, array['23514']);
select tests.ok('pertenencia', 'item owned en sesión de B con vino de B', 'service_role', null,
  $$insert into public.recommendation_items (session_id, batch_no, position, relationship, wine_id, wine_identity)
    values ('5b000000-0000-0000-0000-000000000001', 1, 2, 'owned',
            'b1000000-0000-0000-0000-000000000001', '{"nombre":"Vino B1"}')$$);
select tests.fails('pertenencia', 'función no invocable directamente (authenticated)', 'authenticated', tests.uid('a'),
  $$select public.intel_check_wine_owner()$$, array['42501','0A000']);
select tests.fails('pertenencia', 'función no invocable directamente (service_role)', 'service_role', null,
  $$select public.intel_check_wine_owner()$$, array['42501','0A000']);
select tests.fails('pertenencia', 'función no invocable directamente (anon)', 'anon', null,
  $$select public.intel_check_wine_owner()$$, array['42501','0A000']);


-- -----------------------------------------------------------------------------
-- 6. analytics_identity
-- -----------------------------------------------------------------------------
select tests.fails('analytics', 'A no se asigna alias', 'authenticated', tests.uid('a'),
  $$insert into public.analytics_identity (user_id, display_alias)
    values ('00000000-0000-0000-0000-00000000000a', 'Tester 001')$$, array['42501']);
select tests.fails('analytics', 'A no lee identidades', 'authenticated', tests.uid('a'),
  $$select * from public.analytics_identity$$, array['42501']);
select tests.ok('analytics', 'service_role crea identidad de A (alias e id forzados)', 'service_role', null,
  $$insert into public.analytics_identity (user_id, analytics_id, display_alias)
    values ('00000000-0000-0000-0000-00000000000a', '99999999-9999-9999-9999-999999999999', 'Tester 999')$$);
select tests.eq('analytics', 'alias/id manipulados se ignoran', 'postgres', null,
  $$select count(*) from public.analytics_identity
     where user_id = '00000000-0000-0000-0000-00000000000a'
       and display_alias = 'Tester 001'
       and analytics_id <> '99999999-9999-9999-9999-999999999999'$$, 1);
select tests.fails('analytics', 'una sola identidad por usuario', 'service_role', null,
  $$insert into public.analytics_identity (user_id) values ('00000000-0000-0000-0000-00000000000a')$$, array['23505']);
select setval('public.analytics_alias_seq', 999);
select tests.ok('analytics', 'service_role crea identidad de B', 'service_role', null,
  $$insert into public.analytics_identity (user_id) values ('00000000-0000-0000-0000-00000000000b')$$);
select tests.eq('analytics', 'alias pasa a 4 dígitos (Tester 1000)', 'postgres', null,
  $$select count(*) from public.analytics_identity where display_alias = 'Tester 1000'$$, 1);
select tests.fails('analytics', 'service_role no modifica alias', 'service_role', null,
  $$update public.analytics_identity set display_alias = 'Tester 5'$$, array['42501']);
select tests.fails('analytics', 'service_role no borra identidades', 'service_role', null,
  $$delete from public.analytics_identity$$, array['42501']);
select tests.eq('analytics', 'sin columnas de email/nombre/cava', 'postgres', null,
  $$select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'analytics_identity'$$, 4);


-- -----------------------------------------------------------------------------
-- 7. AISLAMIENTO
-- -----------------------------------------------------------------------------
select tests.eq('aislamiento', 'A ve solo su preferencia', 'authenticated', tests.uid('a'),
  $$select count(*) from public.user_preferences$$, 1);
select tests.eq('aislamiento', 'A no ve preferencias de B', 'authenticated', tests.uid('a'),
  $$select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000b'$$, 0);
select tests.eq('aislamiento', 'B ve solo su preferencia', 'authenticated', tests.uid('b'),
  $$select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000b'$$, 1);
select tests.eq('aislamiento', 'B no ve preferencias de A', 'authenticated', tests.uid('b'),
  $$select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000a'$$, 0);
select tests.eq('aislamiento', 'A ve su conocimiento (4)', 'authenticated', tests.uid('a'),
  $$select count(*) from public.user_knowledge$$, 4);
select tests.eq('aislamiento', 'B ve su conocimiento (1)', 'authenticated', tests.uid('b'),
  $$select count(*) from public.user_knowledge$$, 1);
select tests.eq('aislamiento', 'A ve sus sesiones (2)', 'authenticated', tests.uid('a'),
  $$select count(*) from public.recommendation_sessions$$, 2);
select tests.eq('aislamiento', 'B ve su sesión (1)', 'authenticated', tests.uid('b'),
  $$select count(*) from public.recommendation_sessions$$, 1);
select tests.eq('aislamiento', 'A ve sus items (4)', 'authenticated', tests.uid('a'),
  $$select count(*) from public.recommendation_items$$, 4);
select tests.eq('aislamiento', 'B ve sus items (2)', 'authenticated', tests.uid('b'),
  $$select count(*) from public.recommendation_items$$, 2);
select tests.eq('aislamiento', 'A ve sus eventos (13)', 'authenticated', tests.uid('a'),
  $$select count(*) from public.recommendation_events$$, 13);
select tests.eq('aislamiento', 'B ve su evento (1)', 'authenticated', tests.uid('b'),
  $$select count(*) from public.recommendation_events$$, 1);
select tests.eq('aislamiento', 'A no ve items de B por id', 'authenticated', tests.uid('a'),
  $$select count(*) from public.recommendation_items where id = '1b000000-0000-0000-0000-000000000001'$$, 0);
select tests.eq('aislamiento', 'B no ve eventos de A por sesión', 'authenticated', tests.uid('b'),
  $$select count(*) from public.recommendation_events where session_id = '5a000000-0000-0000-0000-000000000001'$$, 0);
select tests.eq('aislamiento', 'sin JWT (authenticated sin sub) no ve nada', 'authenticated', null,
  $$select (select count(*) from public.user_preferences) + (select count(*) from public.user_knowledge)
         + (select count(*) from public.recommendation_sessions) + (select count(*) from public.recommendation_items)
         + (select count(*) from public.recommendation_events)$$, 0);

do $$
declare t text;
begin
  foreach t in array array['user_preferences','user_knowledge','recommendation_sessions',
                           'recommendation_items','recommendation_events','analytics_identity'] loop
    perform tests.fails('aislamiento', 'anon no lee ' || t, 'anon', null,
      format('select * from public.%I', t), array['42501']);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- 8. INTEGRIDAD
-- -----------------------------------------------------------------------------
-- Borrar un vino propio: el historial sobrevive con snapshot
select tests.ok('integridad', 'A borra su vino A1', 'authenticated', tests.uid('a'),
  $$delete from public.wines where id = 'a1000000-0000-0000-0000-000000000001'$$);
select tests.eq('integridad', 'item owned conservado con wine_id NULL y snapshot', 'postgres', null,
  $$select count(*) from public.recommendation_items
     where id = '1a000000-0000-0000-0000-000000000001' and wine_id is null
       and wine_identity ->> 'nombre' = 'Vino A1'$$, 1);
select tests.eq('integridad', 'eventos del item conservados', 'postgres', null,
  $$select count(*) from public.recommendation_events
     where recommendation_item_id = '1a000000-0000-0000-0000-000000000001'$$, 2);
select tests.eq('integridad', 'conocimiento del vino conservado con snapshot', 'postgres', null,
  $$select count(*) from public.user_knowledge
     where id = 'c0000000-0000-0000-0000-000000000002' and wine_id is null and scope_type = 'wine'
       and wine_snapshot ->> 'nombre' = 'Vino A1' and meaning = 'reserved_for_special_occasion'$$, 1);
select tests.ok('integridad', 'conocimiento huérfano sigue editable (revocar)', 'service_role', null,
  $$update public.user_knowledge set status = 'revoked' where id = 'c0000000-0000-0000-0000-000000000002'$$);

-- Borrar una sesión elimina sus items y eventos (como dueño: no hay DELETE por API)
select tests.ok('integridad', 'borrar sesión 5a..02', 'postgres', null,
  $$delete from public.recommendation_sessions where id = '5a000000-0000-0000-0000-000000000002'$$);
select tests.eq('integridad', 'eventos de la sesión borrados', 'postgres', null,
  $$select count(*) from public.recommendation_events where session_id = '5a000000-0000-0000-0000-000000000002'$$, 0);
select tests.ok('integridad', 'borrar sesión 5a..01', 'postgres', null,
  $$delete from public.recommendation_sessions where id = '5a000000-0000-0000-0000-000000000001'$$);
select tests.eq('integridad', 'items de la sesión borrados', 'postgres', null,
  $$select count(*) from public.recommendation_items where session_id = '5a000000-0000-0000-0000-000000000001'$$, 0);
select tests.eq('integridad', 'eventos de la sesión borrados (incl. con item)', 'postgres', null,
  $$select count(*) from public.recommendation_events where session_id = '5a000000-0000-0000-0000-000000000001'$$, 0);

-- Datos para cascada de usuario
select tests.ok('integridad', 'nueva sesión + item + evento de A', 'service_role', null,
  $$with s as (insert into public.recommendation_sessions (id, user_id, mode)
               values ('5a000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'food')
               returning id),
         i as (insert into public.recommendation_items (id, session_id, batch_no, position, relationship,
                 wine_id, wine_identity)
               select '1a000000-0000-0000-0000-000000000009', id, 1, 1, 'owned',
                      'a1000000-0000-0000-0000-000000000002', '{"nombre":"Vino A2"}' from s
               returning id, session_id)
    insert into public.recommendation_events (session_id, recommendation_item_id, event_type)
    select session_id, id, 'shown' from i$$);

-- Eliminar usuario A desde Auth
select tests.ok('integridad', 'borrar usuario A en auth.users', 'postgres', null,
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000000a'$$);
select tests.eq('integridad', 'cascada: nada de A en las 6 tablas', 'postgres', null,
  $$select (select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000a')
         + (select count(*) from public.user_knowledge where user_id = '00000000-0000-0000-0000-00000000000a')
         + (select count(*) from public.recommendation_sessions where user_id = '00000000-0000-0000-0000-00000000000a')
         + (select count(*) from public.recommendation_items where session_id::text like '5a%')
         + (select count(*) from public.recommendation_events where session_id::text like '5a%')
         + (select count(*) from public.analytics_identity where user_id = '00000000-0000-0000-0000-00000000000a')$$, 0);
select tests.eq('integridad', 'B intacto tras borrar a A', 'postgres', null,
  $$select (select count(*) from public.user_preferences) + (select count(*) from public.user_knowledge)
         + (select count(*) from public.recommendation_sessions) + (select count(*) from public.recommendation_items)
         + (select count(*) from public.recommendation_events) + (select count(*) from public.analytics_identity)$$, 7);


-- -----------------------------------------------------------------------------
-- 9. GUARDA DE LA MIGRACIÓN
-- -----------------------------------------------------------------------------
-- (La re-ejecución de la migración se prueba desde run_local.sh.)


-- -----------------------------------------------------------------------------
-- RESUMEN
-- -----------------------------------------------------------------------------
\echo
\echo '== Fallas (si hay)'
select n, grupo, label, detail from tests.results where not ok order by n;
\echo '== Resumen por grupo'
select grupo, count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail
from tests.results group by grupo order by min(n);

do $$
declare f int; t int;
begin
  select count(*) filter (where not ok), count(*) into f, t from tests.results;
  if f > 0 then
    raise exception 'PRUEBAS ETAPA 7: % de % fallaron', f, t;
  end if;
  raise warning 'PRUEBAS ETAPA 7: % de % OK', t, t;
end $$;

-- =============================================================================
-- PRUEBAS — ETAPA 7.2-A (respuesta a la pregunta de tipos del onboarding)
-- =============================================================================
-- Corre como superusuario sobre una base DESCARTABLE con el shim local, los
-- baselines y las migraciones 20261025000000 y 20261110000000 aplicadas
-- (ver run_local.sh). Usa los usuarios C y D, distintos de los de las
-- pruebas de 7.1. Nunca ejecutar sobre una base real.
-- Termina con error si alguna prueba falla.
-- =============================================================================

\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- Mismo arnés que etapa7_modelo_inteligencia_test.sql (recreado para que
-- este archivo sea independiente).
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

create function tests.uid(c text) returns uuid language sql immutable
as $$ select ('00000000-0000-0000-0000-00000000000' || c)::uuid $$;

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

-- Atajos: C = ...0c, D = ...0d
\set C '''00000000-0000-0000-0000-00000000000c'''
\set D '''00000000-0000-0000-0000-00000000000d'''


-- -----------------------------------------------------------------------------
-- 1. ESQUEMA
-- -----------------------------------------------------------------------------
do $$
begin
  perform tests.record('esquema', 'wine_types_answer: text, NULL, sin default',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'user_preferences'
              and column_name = 'wine_types_answer' and data_type = 'text'
              and is_nullable = 'YES' and column_default is null), null);
  perform tests.record('esquema', 'constraint wine_types_answer_check presente',
    exists (select 1 from pg_constraint
            where conrelid = 'public.user_preferences'::regclass
              and conname = 'user_preferences_wine_types_answer_check' and contype = 'c'
              and convalidated), null);
  perform tests.record('esquema', 'columna documentada (comment)',
    col_description('public.user_preferences'::regclass,
      (select attnum from pg_attribute where attrelid = 'public.user_preferences'::regclass
         and attname = 'wine_types_answer')) is not null, null);
  perform tests.record('esquema', 'user_preferences: 11 columnas (10 de 7.1 + 1)',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'user_preferences') = 11, null);
  perform tests.record('esquema', 'constraints de 7.1 intactas (8) + 1 nueva',
    (select count(*) from pg_constraint where conrelid = 'public.user_preferences'::regclass) = 9, null);
  perform tests.record('esquema', 'RLS sigue habilitado',
    (select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass), null);
  perform tests.record('esquema', 'policies de user_preferences sin cambios (3)',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_preferences') = 3, null);
  perform tests.record('esquema', 'sin grants por columna',
    (select attacl from pg_attribute where attrelid = 'public.user_preferences'::regclass
       and attname = 'wine_types_answer') is null, null);
  perform tests.record('esquema', 'privilegios de tabla sin cambios',
    (select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type)
       from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'user_preferences'
        and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC'))
    = 'authenticated:INSERT,authenticated:SELECT,authenticated:UPDATE,service_role:SELECT', null);
end $$;


-- -----------------------------------------------------------------------------
-- 2. DATOS
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values
  (tests.uid('c'), 'c@test.local'), (tests.uid('d'), 'd@test.local');
insert into public.profiles (id, nombre, role) values
  (tests.uid('c'), 'Usuario C', 'editor'), (tests.uid('d'), 'Usuario D', 'editor');


-- -----------------------------------------------------------------------------
-- 3. (1) USUARIO SIN REGISTRO y (2) CREACIÓN
-- -----------------------------------------------------------------------------
select tests.eq('alta', 'C sin registro previo: 0 filas visibles', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences$$, 0);
select tests.ok('alta', 'C crea su fila solo con user_id', 'authenticated', tests.uid('c'),
  format($$insert into public.user_preferences (user_id) values (%L)$$, :C));
select tests.eq('alta', 'fila nueva: never, respuesta NULL, sin tipos ni exploración', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences
     where onboarding_status = 'never' and wine_types_answer is null
       and preferred_wine_types = '{}' and not exploration_open and preferred_grapes = '{}'
       and knowledge_level is null and onboarding_step is null$$, 1);
select tests.ok('alta', 'C crea por INSERT ... ON CONFLICT DO NOTHING (repetido, sin error)', 'authenticated', tests.uid('c'),
  format($$insert into public.user_preferences (user_id) values (%L) on conflict (user_id) do nothing$$, :C));
select tests.ok('alta', 'D crea su fila', 'authenticated', tests.uid('d'),
  format($$insert into public.user_preferences (user_id) values (%L)$$, :D));


-- -----------------------------------------------------------------------------
-- 4. (3)(4)(5) PREGUNTA DE TIPOS
-- -----------------------------------------------------------------------------
-- answered
select tests.ok('tipos', 'answered con varios tipos', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{tinto,espumoso}', exploration_open = false where user_id = %L$$, :C));
select tests.ok('tipos', 'answered solo con «Me gusta probar de todo»', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{}', exploration_open = true where user_id = %L$$, :C));
select tests.ok('tipos', 'answered con tipos + probar de todo', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{blanco}', exploration_open = true where user_id = %L$$, :C));
select tests.fails('tipos', 'answered vacío (sin tipos ni exploración)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{}', exploration_open = false where user_id = %L$$, :C), array['23514']);

-- no_preference
select tests.ok('tipos', 'no_preference', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'no_preference',
    preferred_wine_types = '{}', exploration_open = false where user_id = %L$$, :C));
select tests.fails('tipos', 'no_preference con tipos', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set preferred_wine_types = '{tinto}' where user_id = %L$$, :C), array['23514']);
select tests.fails('tipos', 'no_preference con probar de todo (no se confunden)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set exploration_open = true where user_id = %L$$, :C), array['23514']);

-- skipped
select tests.ok('tipos', 'skipped (D omite la pregunta)', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = 'skipped' where user_id = %L$$, :D));
select tests.fails('tipos', 'skipped con tipos', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set preferred_wine_types = '{rosado}' where user_id = %L$$, :D), array['23514']);
select tests.fails('tipos', 'skipped con probar de todo', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set exploration_open = true where user_id = %L$$, :D), array['23514']);

-- vocabulario
select tests.fails('tipos', 'valor inválido (none)', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = 'none' where user_id = %L$$, :D), array['23514']);
select tests.fails('tipos', 'valor vacío', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = '' where user_id = %L$$, :D), array['23514']);
select tests.fails('tipos', 'tipo fuera del CHECK de 7.1 sigue rechazado', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{dulce}' where user_id = %L$$, :C), array['23514']);

-- omitir ≠ sin preferencia ≠ no respondida (vistos por postgres)
select tests.eq('tipos', 'C = no_preference, D = skipped: valores distintos', 'postgres', null,
  format($$select count(*) from public.user_preferences
     where (user_id = %L and wine_types_answer = 'no_preference')
        or (user_id = %L and wine_types_answer = 'skipped')$$, :C, :D), 2);

-- Atrás / cambio de respuesta entre valores no NULL
select tests.ok('tipos', 'skipped → answered (vuelve atrás y responde)', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{rosado,naranjo}' where user_id = %L$$, :D));
select tests.ok('tipos', 'answered → no_preference limpiando tipos en la misma sentencia', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = 'no_preference',
    preferred_wine_types = '{}', exploration_open = false where user_id = %L$$, :D));


-- -----------------------------------------------------------------------------
-- 5. (3) VARIEDADES MÚLTIPLES y (6) PROGRESO
-- -----------------------------------------------------------------------------
select tests.ok('progreso', 'C inicia (started, paso 1)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set onboarding_status = 'started', onboarding_step = 1
    where user_id = %L and onboarding_status in ('never', 'started')$$, :C));
select tests.ok('progreso', 'C responde tipos y avanza a paso 2', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{tinto,espumoso}', exploration_open = false, onboarding_step = 2
    where user_id = %L$$, :C));
select tests.ok('progreso', 'C elige varias variedades (paso 3)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set preferred_grapes = '{malbec,pinot_noir,chardonnay}',
    onboarding_step = 3 where user_id = %L$$, :C));
select tests.eq('progreso', 'recupera progreso completo al releer', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences
     where onboarding_status = 'started' and onboarding_step = 3
       and wine_types_answer = 'answered' and preferred_wine_types = '{tinto,espumoso}'
       and preferred_grapes = '{malbec,pinot_noir,chardonnay}' and onboarding_resolved_at is null$$, 1);


-- -----------------------------------------------------------------------------
-- 6. (8) ESCRITURAS PARCIALES
-- -----------------------------------------------------------------------------
select tests.ok('parcial', 'C guarda solo knowledge_level', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set knowledge_level = 'beginner' where user_id = %L$$, :C));
select tests.eq('parcial', 'tipos, variedades, paso y respuesta intactos', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences
     where knowledge_level = 'beginner' and onboarding_step = 3
       and wine_types_answer = 'answered' and preferred_wine_types = '{tinto,espumoso}'
       and preferred_grapes = '{malbec,pinot_noir,chardonnay}'$$, 1);
select tests.ok('parcial', 'C guarda solo variedades', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set preferred_grapes = '{malbec}' where user_id = %L$$, :C));
select tests.eq('parcial', 'knowledge_level y tipos intactos', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences
     where preferred_grapes = '{malbec}' and knowledge_level = 'beginner'
       and wine_types_answer = 'answered' and preferred_wine_types = '{tinto,espumoso}'$$, 1);


-- -----------------------------------------------------------------------------
-- 7. (7) EDICIÓN SIN ALTERAR completed / skipped
-- -----------------------------------------------------------------------------
select tests.ok('edicion', 'C completa', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set onboarding_status = 'completed', onboarding_step = 4,
    onboarding_resolved_at = '2026-11-10 12:00:00+00'
    where user_id = %L and onboarding_status in ('never', 'started')$$, :C));
select tests.ok('edicion', 'D omite el onboarding', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set onboarding_status = 'skipped',
    onboarding_resolved_at = '2026-11-10 13:00:00+00'
    where user_id = %L and onboarding_status in ('never', 'started')$$, :D));
select tests.ok('edicion', 'C edita preferencias después (solo columnas de preferencias)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set wine_types_answer = 'no_preference',
    preferred_wine_types = '{}', exploration_open = false, preferred_grapes = '{torrontes}'
    where user_id = %L$$, :C));
select tests.eq('edicion', 'C sigue completed con la misma fecha y paso', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences
     where onboarding_status = 'completed' and onboarding_step = 4
       and onboarding_resolved_at = '2026-11-10 12:00:00+00'
       and wine_types_answer = 'no_preference' and preferred_grapes = '{torrontes}'$$, 1);
select tests.ok('edicion', 'D edita preferencias después', 'authenticated', tests.uid('d'),
  format($$update public.user_preferences set wine_types_answer = 'answered',
    preferred_wine_types = '{naranjo}', knowledge_level = 'advanced' where user_id = %L$$, :D));
select tests.eq('edicion', 'D sigue skipped con la misma fecha', 'authenticated', tests.uid('d'),
  $$select count(*) from public.user_preferences
     where onboarding_status = 'skipped' and onboarding_resolved_at = '2026-11-10 13:00:00+00'
       and wine_types_answer = 'answered' and preferred_wine_types = '{naranjo}'$$, 1);
select tests.eq('edicion', 'un UPDATE condicionado a never/started no afecta a completed (0 filas)',
  'authenticated', tests.uid('c'),
  format($$with u as (update public.user_preferences set onboarding_status = 'started', onboarding_resolved_at = null
     where user_id = %L and onboarding_status in ('never', 'started') returning 1)
   select count(*) from u$$, :C), 0);


-- -----------------------------------------------------------------------------
-- 8. (9) PERMISOS Y AISLAMIENTO
-- -----------------------------------------------------------------------------
select tests.eq('permisos', 'C ve solo su fila', 'authenticated', tests.uid('c'),
  $$select count(*) from public.user_preferences where user_id <> '00000000-0000-0000-0000-00000000000c'$$, 0);
select tests.eq('permisos', 'C no actualiza la respuesta de D (0 filas)', 'authenticated', tests.uid('c'),
  format($$with u as (update public.user_preferences set wine_types_answer = 'skipped',
     preferred_wine_types = '{}', exploration_open = false where user_id = %L returning 1)
   select count(*) from u$$, :D), 0);
select tests.fails('permisos', 'C no crea fila a nombre de D', 'authenticated', tests.uid('c'),
  format($$insert into public.user_preferences (user_id, wine_types_answer) values (%L, 'skipped')$$, :D),
  array['42501', '23505']);
select tests.fails('permisos', 'C no borra su fila', 'authenticated', tests.uid('c'),
  format($$delete from public.user_preferences where user_id = %L$$, :C), array['42501']);
select tests.fails('permisos', 'anon no lee', 'anon', null,
  $$select wine_types_answer from public.user_preferences$$, array['42501']);
select tests.fails('permisos', 'anon no escribe', 'anon', null,
  format($$update public.user_preferences set wine_types_answer = 'skipped' where user_id = %L$$, :C), array['42501']);
select tests.fails('permisos', 'service_role no escribe la respuesta', 'service_role', null,
  format($$update public.user_preferences set wine_types_answer = 'skipped' where user_id = %L$$, :C), array['42501']);
select tests.eq('permisos', 'service_role sí lee (SELECT de 7.1)', 'service_role', null,
  format($$select count(*) from public.user_preferences where user_id in (%L, %L)$$, :C, :D), 2);
select tests.eq('permisos', 'authenticated sin sub no ve nada', 'authenticated', null,
  $$select count(*) from public.user_preferences$$, 0);
select tests.eq('permisos', 'datos de D intactos tras los intentos de C', 'postgres', null,
  format($$select count(*) from public.user_preferences where user_id = %L
     and wine_types_answer = 'answered' and preferred_wine_types = '{naranjo}'$$, :D), 1);


-- -----------------------------------------------------------------------------
-- 9. (10) COMPATIBILIDAD CON 7.1
-- -----------------------------------------------------------------------------
-- Una fila válida en 7.1 (escrita sin conocer la columna nueva) sigue siendo
-- válida: NULL no impone condiciones.
select tests.ok('compat', 'insert estilo 7.1 con tipos y sin respuesta (NULL)', 'postgres', null,
  $$insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e');
    insert into public.profiles (id, nombre) values ('00000000-0000-0000-0000-00000000000e', 'Usuario E');
    insert into public.user_preferences (user_id, preferred_wine_types, exploration_open, onboarding_status, onboarding_step)
    values ('00000000-0000-0000-0000-00000000000e', '{tinto}', true, 'started', 2)$$);
select tests.fails('compat', 'CHECK resolved_at de 7.1 sigue vigente', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set onboarding_resolved_at = null where user_id = %L$$, :C), array['23514']);
select tests.fails('compat', 'CHECK de estado de 7.1 sigue vigente', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set onboarding_status = 'done' where user_id = %L$$, :C), array['23514']);
select tests.fails('compat', 'CHECK de nivel de 7.1 sigue vigente', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set knowledge_level = 'experto' where user_id = %L$$, :C), array['23514']);
select tests.fails('compat', 'CHECK de variedades de 7.1 sigue vigente (cadena vacía)', 'authenticated', tests.uid('c'),
  format($$update public.user_preferences set preferred_grapes = '{malbec,""}' where user_id = %L$$, :C), array['23514']);
select tests.eq('compat', 'trigger de timestamps de 7.1 sigue fijando updated_at', 'postgres', null,
  $$select count(*) from public.user_preferences where updated_at >= created_at and updated_at > now() - interval '1 hour'
     and user_id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d')$$, 2);
select tests.ok('compat', 'cascada de 7.1: borrar usuario E en auth.users', 'postgres', null,
  $$delete from auth.users where id = '00000000-0000-0000-0000-00000000000e'$$);
select tests.eq('compat', 'fila de E eliminada por cascada', 'postgres', null,
  $$select count(*) from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000e'$$, 0);


-- -----------------------------------------------------------------------------
-- RESUMEN
-- -----------------------------------------------------------------------------
\echo
\echo '== Fallas 7.2-A (si hay)'
select n, grupo, label, detail from tests.results where not ok order by n;
\echo '== Resumen por grupo 7.2-A'
select grupo, count(*) filter (where ok) as pass, count(*) filter (where not ok) as fail
from tests.results group by grupo order by min(n);

do $$
declare f int; t int;
begin
  select count(*) filter (where not ok), count(*) into f, t from tests.results;
  if f > 0 then
    raise exception 'PRUEBAS ETAPA 7.2-A: % de % fallaron', f, t;
  end if;
  raise warning 'PRUEBAS ETAPA 7.2-A: % de % OK', t, t;
end $$;

-- =============================================================================
-- SHIM MÍNIMO DE SUPABASE PARA PRUEBAS LOCALES
-- =============================================================================
-- Solo para una base PostgreSQL 17 vacía y descartable. NUNCA ejecutar sobre
-- un proyecto Supabase: crea roles, esquemas y default privileges.
--
-- Reproduce lo que los baselines y las migraciones necesitan de Supabase:
--   * roles anon, authenticated (NOLOGIN) y service_role (NOLOGIN, BYPASSRLS);
--   * esquema auth con auth.users y auth.uid() leyendo los claims del JWT
--     desde request.jwt.claims / request.jwt.claim.sub, como PostgREST;
--   * esquema storage con buckets y objects (con RLS);
--   * USAGE de public para los roles de la API;
--   * default privileges de postgres en public tal como los documenta
--     supabase/README.md (verificado en producción el 2026-10-10):
--     tablas nuevas → solo TRUNCATE, REFERENCES, TRIGGER, MAINTAIN para los
--     roles de la API; funciones nuevas → sin EXECUTE para PUBLIC.
--
-- Diferencias conocidas con un stack Supabase real: aquí postgres es
-- superusuario; no hay PostgREST, GoTrue, Storage API ni authenticator; el
-- esquema auth es solo lo mínimo; no hay extensiones de Supabase.
-- =============================================================================

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (
  id         uuid primary key,
  email      text,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid
 language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text
);
alter table storage.objects enable row level security;

grant usage on schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant truncate, references, trigger, maintain on tables to anon, authenticated, service_role;
-- El EXECUTE de PUBLIC sobre funciones es un default global: los default
-- privileges por esquema solo pueden sumar, no quitar.
alter default privileges for role postgres
  revoke execute on functions from public;

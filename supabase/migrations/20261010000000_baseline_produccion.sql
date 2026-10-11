-- =============================================================================
-- BASELINE DE PRODUCCIÓN — esquema public
-- =============================================================================
-- Snapshot del estado de la base de datos de producción de Mi Cava, verificado
-- el 2026-10-10 mediante consultas de solo lectura a los catálogos de Postgres
-- (PostgreSQL 17.6, Supabase).
--
-- Este archivo es el PUNTO CERO del versionado de la base:
--   * Representa el estado vigente, no la historia de cómo se llegó a él.
--   * NO se modifica nunca. Cualquier cambio posterior va en una migración nueva.
--   * NO debe aplicarse sobre producción: producción ya está en este estado.
--     La guarda de abajo aborta la ejecución si encuentra la tabla public.wines.
--
-- Reproduce el estado tal como está, incluidos permisos y comportamientos que
-- podrían revisarse en el futuro. No corrige nada.
--
-- Fuera de este archivo:
--   * Storage (bucket y policies): 20261010000001_baseline_storage.sql
--   * Configuración que no es SQL (Auth, hook de emails, Edge Functions,
--     Realtime, datos): ver supabase/README.md
--
-- Requiere un proyecto Supabase (usa auth.users, auth.uid() y los roles anon,
-- authenticated y service_role). gen_random_uuid() es nativa de Postgres 13+.
-- =============================================================================


-- Todo el archivo corre en una única transacción: si la guarda (o cualquier
-- sentencia) falla, no se aplica nada, aunque el cliente siga ejecutando.
begin;

-- -----------------------------------------------------------------------------
-- 0. Guarda: no aplicar sobre una base que ya tiene el esquema
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.wines') is not null then
    raise exception 'Baseline 20261010000000 no aplicado: public.wines ya existe. '
      'Este archivo describe el estado de producción al 2026-10-10 y solo debe '
      'aplicarse sobre una base vacía.';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. Tablas, columnas y constraints
-- -----------------------------------------------------------------------------

-- Perfil de cada usuario de Auth (1:1). El rol define los permisos en la app.
create table public.profiles (
  id         uuid        not null,
  nombre     text        not null,
  created_at timestamptz not null default now(),
  role       text        not null default 'editor',
  constraint profiles_pkey primary key (id),
  constraint profiles_id_fkey foreign key (id)
    references auth.users (id) on delete cascade,
  constraint profiles_role_check check (role in ('admin', 'editor', 'viewer'))
);

-- Identidad del vino. El id lo genera el cliente (sin default).
-- No hay restricción UNIQUE sobre nombre/bodega/añada.
-- user_id tiene dos FKs: a auth.users (cascade) y a profiles (sin ON DELETE).
create table public.wines (
  id         uuid        not null,
  nombre     text        not null,
  bodega     text,
  varietal   text,
  anada      integer,
  maridaje   text,
  foto_url   text,
  user_id    uuid        not null,
  created_at timestamptz not null default now(),
  region     text,
  lugar      text,
  constraint wines_pkey primary key (id),
  constraint wines_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete cascade,
  constraint wines_profile_fkey foreign key (user_id)
    references public.profiles (id)
);

-- Datos privados del vino (precio, stock, favorito). 1:1 con wines.
create table public.wine_privado (
  wine_id    uuid        not null,
  user_id    uuid        not null,
  precio     numeric,
  stock      integer     not null default 0,
  favorito   boolean     not null default false,
  created_at timestamptz not null default now(),
  constraint wine_privado_pkey primary key (wine_id),
  constraint wine_privado_wine_id_fkey foreign key (wine_id)
    references public.wines (id) on delete cascade,
  constraint wine_privado_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint wine_privado_stock_check check (stock >= 0)
);

-- Historial de aperturas / experiencias.
create table public.consumos (
  id         uuid        not null default gen_random_uuid(),
  wine_id    uuid        not null,
  user_id    uuid        not null,
  fecha      timestamptz not null default now(),
  puntuacion numeric,
  comentario text,
  comida     text,
  created_at timestamptz not null default now(),
  constraint consumos_pkey primary key (id),
  constraint consumos_wine_id_fkey foreign key (wine_id)
    references public.wines (id) on delete cascade,
  constraint consumos_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint consumos_puntuacion_check
    check (puntuacion is null or (puntuacion >= 0.5 and puntuacion <= 5))
);

-- Puntaje general por persona y vino (tabla legado).
-- user_id tiene dos FKs: a auth.users (cascade) y a profiles (sin ON DELETE).
create table public.ratings (
  id         uuid        not null default gen_random_uuid(),
  wine_id    uuid        not null,
  user_id    uuid        not null,
  valor      numeric     not null,
  created_at timestamptz not null default now(),
  constraint ratings_pkey primary key (id),
  constraint ratings_wine_id_user_id_key unique (wine_id, user_id),
  constraint ratings_wine_id_fkey foreign key (wine_id)
    references public.wines (id) on delete cascade,
  constraint ratings_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete cascade,
  constraint ratings_profile_fkey foreign key (user_id)
    references public.profiles (id),
  constraint ratings_valor_check check (valor >= 0.5 and valor <= 5)
);

-- Solicitudes de acceso a la beta. email_normalizado es una columna generada.
-- updated_at no tiene trigger: lo actualiza el código que modifica la fila.
create table public.access_requests (
  id                uuid        not null default gen_random_uuid(),
  nombre            text        not null,
  email             text        not null,
  email_normalizado text        generated always as (lower(trim(both from email))) stored,
  status            text        not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint access_requests_pkey primary key (id),
  constraint access_requests_status_check
    check (status in ('pending', 'approved', 'rejected'))
);

-- Auditoría de cambios de rol. Solo se escribe desde admin_set_role().
-- changed_by referencia auth.users sin ON DELETE.
create table public.role_audit_log (
  id             uuid        not null default gen_random_uuid(),
  target_user_id uuid        not null,
  changed_by     uuid        not null,
  old_role       text        not null,
  new_role       text        not null,
  created_at     timestamptz not null default now(),
  constraint role_audit_log_pkey primary key (id),
  constraint role_audit_log_target_user_id_fkey foreign key (target_user_id)
    references auth.users (id) on delete cascade,
  constraint role_audit_log_changed_by_fkey foreign key (changed_by)
    references auth.users (id)
);


-- -----------------------------------------------------------------------------
-- 2. Índices (además de los implícitos de PK y UNIQUE)
-- -----------------------------------------------------------------------------

-- Un solo pedido pendiente por email (el frontend maneja el error 23505).
create unique index idx_access_requests_pending_unico
  on public.access_requests using btree (email_normalizado)
  where (status = 'pending');

create index idx_consumos_user_fecha
  on public.consumos using btree (user_id, fecha desc);

create index idx_consumos_wine
  on public.consumos using btree (wine_id);

create index idx_wine_privado_user
  on public.wine_privado using btree (user_id);

create index idx_wines_user
  on public.wines using btree (user_id);


-- -----------------------------------------------------------------------------
-- 3. Funciones
-- -----------------------------------------------------------------------------
-- Todas son SECURITY DEFINER con search_path fijado. Los cuerpos son copia
-- textual de pg_get_functiondef() en producción.

create or replace function public.is_admin(uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = uid and role = 'admin');
$function$;

create or replace function public.can_edit(uid uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from profiles where id = uid and role in ('admin', 'editor'));
$function$;

create or replace function public.admin_list_users()
 returns table(id uuid, nombre text, email text, role text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'No autorizado';
  end if;
  return query
    select p.id, p.nombre, u.email::text, p.role
    from profiles p
    join auth.users u on u.id = p.id
    order by p.created_at asc;
end;
$function$;

create or replace function public.admin_set_role(target_id uuid, new_role text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  old_role text;
  admin_count integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'No autorizado';
  end if;
  if new_role not in ('admin', 'editor', 'viewer') then
    raise exception 'Rol inválido';
  end if;
  if target_id = auth.uid() then
    raise exception 'No podés modificar tu propio rol';
  end if;

  select role into old_role from profiles where id = target_id;
  if old_role is null then
    raise exception 'Usuario no encontrado';
  end if;

  if old_role = 'admin' and new_role <> 'admin' then
    select count(*) into admin_count from profiles where role = 'admin';
    if admin_count <= 1 then
      raise exception 'Debe quedar al menos un administrador';
    end if;
  end if;

  update profiles set role = new_role where id = target_id;

  insert into role_audit_log (target_user_id, changed_by, old_role, new_role)
  values (target_id, auth.uid(), old_role, new_role);
end;
$function$;

-- Descuenta 1 de stock y registra el consumo en una sola operación.
create or replace function public.registrar_consumo(p_wine_id uuid, p_puntuacion numeric default null::numeric, p_comentario text default null::text, p_comida text default null::text)
 returns table(stock integer, consumo_id uuid)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_new_stock integer;
  v_consumo_id uuid;
begin
  if not public.can_edit(auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update wine_privado
  set stock = wine_privado.stock - 1
  where wine_privado.wine_id = p_wine_id
    and wine_privado.user_id = auth.uid()
    and wine_privado.stock > 0
  returning wine_privado.stock into v_new_stock;

  if v_new_stock is null then
    raise exception 'No hay stock disponible para registrar este consumo';
  end if;

  insert into consumos (wine_id, user_id, puntuacion, comentario, comida)
  values (p_wine_id, auth.uid(), p_puntuacion, p_comentario, p_comida)
  returning id into v_consumo_id;

  return query select v_new_stock, v_consumo_id;
end;
$function$;

-- Funciones de trigger
create or replace function public.prevent_role_self_escalation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.role is distinct from old.role then
    if auth.uid() = old.id then
      raise exception 'No podés modificar tu propio rol';
    end if;
    if not public.is_admin(auth.uid()) then
      raise exception 'Solo un administrador puede cambiar el rol de un usuario';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_last_admin_removal()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  admin_count integer;
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role is distinct from 'admin') then
    select count(*) into admin_count from profiles where role = 'admin';
    if admin_count <= 1 then
      raise exception 'Debe quedar al menos un administrador';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create or replace function public.prevent_consumo_reassignment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.wine_id is distinct from old.wine_id or new.user_id is distinct from old.user_id then
    raise exception 'No se puede reasignar un consumo a otro vino o usuario';
  end if;
  return new;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

create trigger trg_prevent_last_admin_removal
  before delete or update on public.profiles
  for each row execute function public.prevent_last_admin_removal();

create trigger trg_prevent_consumo_reassignment
  before update on public.consumos
  for each row execute function public.prevent_consumo_reassignment();


-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.wines           enable row level security;
alter table public.wine_privado    enable row level security;
alter table public.consumos        enable row level security;
alter table public.ratings         enable row level security;
alter table public.access_requests enable row level security;
alter table public.role_audit_log  enable row level security;


-- -----------------------------------------------------------------------------
-- 6. Policies (todas PERMISSIVE)
-- -----------------------------------------------------------------------------

-- profiles
create policy "profiles: lectura publica" on public.profiles
  for select using (true);
create policy "profiles: cada uno crea la suya" on public.profiles
  for insert with check ((auth.uid() = id) and (role = 'editor'));
create policy "profiles: cada uno edita la suya" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles: admin actualiza cualquiera" on public.profiles
  for update to authenticated using (public.is_admin(auth.uid()));

-- wines
create policy "wines: cada uno ve la suya" on public.wines
  for select using (auth.uid() = user_id);
create policy "wines: solo admin/editor crean" on public.wines
  for insert with check ((auth.uid() = user_id) and public.can_edit(auth.uid()));
create policy "wines: autor admin/editor edita" on public.wines
  for update using ((auth.uid() = user_id) and public.can_edit(auth.uid()));
create policy "wines: autor admin/editor borra" on public.wines
  for delete using ((auth.uid() = user_id) and public.can_edit(auth.uid()));

-- wine_privado
create policy "wine_privado: cada uno ve el suyo" on public.wine_privado
  for select using (auth.uid() = user_id);
create policy "wine_privado: admin/editor gestiona el suyo" on public.wine_privado
  for all
  using ((auth.uid() = user_id) and public.can_edit(auth.uid()))
  with check ((auth.uid() = user_id) and public.can_edit(auth.uid()));

-- consumos (sin policy de DELETE)
create policy "consumos: cada uno ve los suyos" on public.consumos
  for select using (auth.uid() = user_id);
create policy "consumos: registrar en propio vino" on public.consumos
  for insert with check (
    (auth.uid() = user_id)
    and public.can_edit(auth.uid())
    and exists (
      select 1 from public.wines w
      where w.id = consumos.wine_id and w.user_id = auth.uid()
    )
  );
create policy "consumos: actualizar propio consumo" on public.consumos
  for update
  using ((auth.uid() = user_id) and public.can_edit(auth.uid()))
  with check ((auth.uid() = user_id) and public.can_edit(auth.uid()));

-- ratings
create policy "ratings: cada uno ve la suya" on public.ratings
  for select using (auth.uid() = user_id);
create policy "ratings: puntuar solo tu propio vino" on public.ratings
  for insert with check (
    (auth.uid() = user_id)
    and exists (
      select 1 from public.wines w
      where w.id = ratings.wine_id and w.user_id = auth.uid()
    )
  );
create policy "ratings: cada uno edita su puntaje" on public.ratings
  for update using (auth.uid() = user_id);
create policy "ratings: cada uno borra su puntaje" on public.ratings
  for delete using (auth.uid() = user_id);

-- access_requests
create policy "access_requests: cualquiera solicita" on public.access_requests
  for insert with check (status = 'pending');
create policy "access_requests: solo admin lee" on public.access_requests
  for select using (public.is_admin(auth.uid()));
create policy "access_requests: solo admin actualiza" on public.access_requests
  for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- role_audit_log (sin policies de escritura: solo escribe admin_set_role)
create policy "role_audit_log: solo admin lee" on public.role_audit_log
  for select using (public.is_admin(auth.uid()));


-- -----------------------------------------------------------------------------
-- 7. Privilegios
-- -----------------------------------------------------------------------------
-- Se declaran de forma explícita (REVOKE ALL + GRANT exacto) para que el
-- resultado no dependa de los default privileges del proyecto donde se aplique.
-- El dueño de todos los objetos es postgres, que conserva todos los privilegios.
-- Se reproduce el estado de producción tal como está, incluidos TRUNCATE,
-- REFERENCES, TRIGGER y MAINTAIN para los roles de la API.

-- 7.1 Tablas
revoke all on table
  public.profiles, public.wines, public.wine_privado, public.consumos,
  public.ratings, public.access_requests, public.role_audit_log
  from public, anon, authenticated, service_role;

-- profiles
grant select, truncate, references, trigger, maintain
  on table public.profiles to anon;
grant select, insert, update, truncate, references, trigger, maintain
  on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

-- wines
grant select, truncate, references, trigger, maintain
  on table public.wines to anon;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on table public.wines to authenticated;
grant truncate, references, trigger, maintain
  on table public.wines to service_role;

-- wine_privado
grant truncate, references, trigger, maintain
  on table public.wine_privado to anon;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on table public.wine_privado to authenticated;
grant truncate, references, trigger, maintain
  on table public.wine_privado to service_role;

-- consumos (sin DELETE para ningún rol de la API)
grant truncate, references, trigger, maintain
  on table public.consumos to anon;
grant select, insert, update, truncate, references, trigger, maintain
  on table public.consumos to authenticated;
grant truncate, references, trigger, maintain
  on table public.consumos to service_role;

-- ratings
grant select, truncate, references, trigger, maintain
  on table public.ratings to anon;
grant select, insert, update, delete, truncate, references, trigger, maintain
  on table public.ratings to authenticated;
grant truncate, references, trigger, maintain
  on table public.ratings to service_role;

-- access_requests
grant insert, truncate, references, trigger, maintain
  on table public.access_requests to anon;
grant select, insert, update, truncate, references, trigger, maintain
  on table public.access_requests to authenticated;
grant all on table public.access_requests to service_role;

-- role_audit_log
grant truncate, references, trigger, maintain
  on table public.role_audit_log to anon;
grant select, truncate, references, trigger, maintain
  on table public.role_audit_log to authenticated;
grant truncate, references, trigger, maintain
  on table public.role_audit_log to service_role;

-- 7.2 Funciones
revoke all on function
  public.is_admin(uuid),
  public.can_edit(uuid),
  public.admin_list_users(),
  public.admin_set_role(uuid, text),
  public.registrar_consumo(uuid, numeric, text, text),
  public.prevent_role_self_escalation(),
  public.prevent_last_admin_removal(),
  public.prevent_consumo_reassignment()
  from public, anon, authenticated, service_role;

-- Usadas por las policies: deben poder ejecutarlas anon y authenticated.
grant execute on function public.is_admin(uuid) to public, anon, authenticated;
grant execute on function public.can_edit(uuid) to public, anon, authenticated;

-- RPC: ejecutables por PUBLIC y authenticated, tal como en producción.
-- La autorización real la hacen los chequeos internos (is_admin / can_edit).
grant execute on function public.admin_list_users() to public, authenticated;
grant execute on function public.admin_set_role(uuid, text) to public, authenticated;
grant execute on function public.registrar_consumo(uuid, numeric, text, text) to public, authenticated;

-- Funciones de trigger: en producción conservan el permiso por defecto de
-- Postgres (EXECUTE para PUBLIC).
grant execute on function public.prevent_role_self_escalation() to public;
grant execute on function public.prevent_last_admin_removal() to public;
grant execute on function public.prevent_consumo_reassignment() to public;

commit;

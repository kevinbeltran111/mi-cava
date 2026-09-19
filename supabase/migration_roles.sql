-- MIGRACIÓN: sistema de roles (admin / editor / viewer)
-- Correr UNA SOLA VEZ sobre el proyecto de Supabase ya existente.
-- No borra ni reemplaza nada de lo que ya funciona; se integra con las
-- policies actuales de profiles/wines/ratings.

-- 1) Columna de rol en profiles. Default 'editor' para no cambiar el
-- comportamiento de nadie que ya tenga cuenta (vos + tus amigos).
alter table profiles
  add column if not exists role text not null default 'editor'
  check (role in ('admin', 'editor', 'viewer'));

-- 2) Promoverte a admin. Reemplazá el mail antes de correr esto.
-- update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'TU-MAIL-AQUI@ejemplo.com');

-- 3) Funciones de chequeo de rol, usadas por las policies.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = uid and role = 'admin');
$$;

create or replace function public.can_edit(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = uid and role in ('admin', 'editor'));
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.can_edit(uuid) to anon, authenticated;

-- 4) Nadie puede ponerse a sí mismo un rol distinto de 'editor' al crear
-- su perfil (refuerza el default, aunque el cliente mande otra cosa).
drop policy if exists "profiles: cada uno crea la suya" on profiles;
create policy "profiles: cada uno crea la suya" on profiles
  for insert with check (auth.uid() = id and role = 'editor');

-- 5) Un admin puede actualizar el perfil de cualquiera (para cambiar roles
-- desde el panel). La policy de "cada uno edita la suya" ya existe y se
-- mantiene intacta (para que sigan pudiendo cambiar su propio nombre).
create policy "profiles: admin actualiza cualquiera" on profiles
  for update to authenticated
  using (public.is_admin(auth.uid()));

-- 6) Nadie puede cambiar su PROPIO rol, ni siquiera un admin, y nadie que
-- no sea admin puede cambiar el rol de otro. Esto corre sin importar por
-- qué policy entró el UPDATE (defensa a nivel de tabla, no de interfaz).
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists trg_prevent_role_self_escalation on profiles;
create trigger trg_prevent_role_self_escalation
  before update on profiles
  for each row
  execute function public.prevent_role_self_escalation();

-- 7) Siempre debe quedar al menos un admin activo.
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists trg_prevent_last_admin_removal on profiles;
create trigger trg_prevent_last_admin_removal
  before update or delete on profiles
  for each row
  execute function public.prevent_last_admin_removal();

-- 8) wines: crear/editar/borrar ahora requiere además ser admin o editor.
-- (ratings queda EXACTAMENTE igual que hoy: cualquier logueado puntúa.)
drop policy if exists "wines: solo logueados crean" on wines;
create policy "wines: solo admin/editor crean" on wines
  for insert with check (auth.uid() = user_id and public.can_edit(auth.uid()));

drop policy if exists "wines: solo el autor edita" on wines;
create policy "wines: autor admin/editor edita" on wines
  for update using (auth.uid() = user_id and public.can_edit(auth.uid()));

drop policy if exists "wines: solo el autor borra" on wines;
create policy "wines: autor admin/editor borra" on wines
  for delete using (auth.uid() = user_id and public.can_edit(auth.uid()));

-- 9) Tabla mínima de auditoría de cambios de rol.
create table if not exists role_audit_log (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  old_role text not null,
  new_role text not null,
  created_at timestamptz not null default now()
);

alter table role_audit_log enable row level security;
drop policy if exists "role_audit_log: solo admin lee" on role_audit_log;
create policy "role_audit_log: solo admin lee" on role_audit_log
  for select using (public.is_admin(auth.uid()));

grant select on role_audit_log to authenticated;
grant usage on schema public to anon, authenticated;

-- 10) Funciones que usa el panel de administración.
-- Lee nombre+email+rol sin exponer la tabla auth.users directamente.
create or replace function public.admin_list_users()
returns table (id uuid, nombre text, email text, role text)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.admin_list_users() to authenticated;

-- Cambia el rol de un usuario, con los mismos resguardos que los triggers
-- (los repite acá para dar un mensaje de error claro en el panel) y deja
-- registro en role_audit_log.
create or replace function public.admin_set_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.admin_set_role(uuid, text) to authenticated;

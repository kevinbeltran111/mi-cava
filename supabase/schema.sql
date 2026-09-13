-- Ejecutar este script completo en Supabase: SQL Editor > New query > pegar todo > Run

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  created_at timestamptz not null default now()
);

create table if not exists wines (
  id uuid primary key,
  nombre text not null,
  bodega text,
  varietal text,
  anada integer,
  precio numeric,
  maridaje text,
  foto_url text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wines_profile_fkey foreign key (user_id) references profiles(id)
);

create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references wines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  valor numeric not null check (valor >= 0.5 and valor <= 5),
  created_at timestamptz not null default now(),
  unique (wine_id, user_id),
  constraint ratings_profile_fkey foreign key (user_id) references profiles(id)
);

alter table profiles enable row level security;
alter table wines enable row level security;
alter table ratings enable row level security;

-- Cualquiera con el link puede LEER (así funciona la vista pública de solo lectura).
-- Para CREAR, EDITAR o BORRAR hace falta estar logueado y ser el dueño del registro.

create policy "profiles: lectura publica" on profiles
  for select using (true);
create policy "profiles: cada uno crea la suya" on profiles
  for insert with check (auth.uid() = id);
create policy "profiles: cada uno edita la suya" on profiles
  for update using (auth.uid() = id);

create policy "wines: lectura publica" on wines
  for select using (true);
create policy "wines: solo logueados crean" on wines
  for insert with check (auth.uid() = user_id);
create policy "wines: solo el autor edita" on wines
  for update using (auth.uid() = user_id);
create policy "wines: solo el autor borra" on wines
  for delete using (auth.uid() = user_id);

create policy "ratings: lectura publica" on ratings
  for select using (true);
create policy "ratings: solo logueados puntuan" on ratings
  for insert with check (auth.uid() = user_id);
create policy "ratings: cada uno edita su puntaje" on ratings
  for update using (auth.uid() = user_id);
create policy "ratings: cada uno borra su puntaje" on ratings
  for delete using (auth.uid() = user_id);

-- Las políticas de arriba solo controlan FILAS. Postgres además exige permisos
-- a nivel de TABLA para los roles que usa la API (anon = sin login,
-- authenticated = logueado). Sin esto, da "permission denied" aunque las
-- políticas estén bien.
grant usage on schema public to anon, authenticated;

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

grant select on public.wines to anon, authenticated;
grant insert, update, delete on public.wines to authenticated;

grant select on public.ratings to anon, authenticated;
grant insert, update, delete on public.ratings to authenticated;

-- Permisos del bucket de fotos: cualquiera puede ver las fotos (bucket
-- público), pero solo los logueados pueden subir/reemplazar/borrar.
create policy "etiquetas: subir logueados" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas');

create policy "etiquetas: actualizar logueados" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas');

create policy "etiquetas: borrar logueados" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas');

-- Al igual que con las tablas de arriba, storage.objects también necesita
-- el permiso de tabla (no solo las políticas de seguridad) para que
-- anon/authenticated puedan usarla.
grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

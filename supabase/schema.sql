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

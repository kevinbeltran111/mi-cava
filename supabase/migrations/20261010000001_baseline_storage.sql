-- =============================================================================
-- BASELINE DE PRODUCCIÓN — Storage
-- =============================================================================
-- Snapshot del Storage de Mi Cava verificado el 2026-10-10 (solo lectura).
-- Complementa 20261010000000_baseline_produccion.sql.
--
-- Este archivo NO se modifica y NO debe aplicarse sobre producción: producción
-- ya está en este estado. La guarda de abajo aborta si las policies ya existen.
--
-- Incluye únicamente lo que crea la aplicación:
--   * el bucket "etiquetas" (fotos de etiquetas, nombre de archivo <wine_id>.jpg);
--   * las policies de la aplicación sobre storage.objects.
-- No incluye el esquema storage, su RLS ni sus GRANTs: los administra Supabase.
-- No incluye objetos (archivos): son datos.
-- =============================================================================


-- Todo el archivo corre en una única transacción: si la guarda (o cualquier
-- sentencia) falla, no se aplica nada, aunque el cliente siga ejecutando.
begin;

-- -----------------------------------------------------------------------------
-- 0. Guarda
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'etiquetas: subir logueados'
  ) then
    raise exception 'Baseline 20261010000001 no aplicado: las policies de '
      'storage.objects ya existen. Este archivo describe el estado de producción '
      'al 2026-10-10 y solo debe aplicarse sobre un proyecto vacío.';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. Bucket
-- -----------------------------------------------------------------------------
-- Público (las fotos se sirven por URL pública), sin límite de tamaño por
-- archivo y sin restricción de tipos MIME.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('etiquetas', 'etiquetas', true, null, null)
on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Policies sobre storage.objects
-- -----------------------------------------------------------------------------
-- No hay policy de SELECT: la lectura se hace por URL pública del bucket y
-- nadie puede listar el bucket desde la API.

create policy "etiquetas: subir logueados" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'etiquetas');

create policy "etiquetas: actualizar logueados" on storage.objects
  for update to authenticated
  using (bucket_id = 'etiquetas');

create policy "etiquetas: borrar logueados" on storage.objects
  for delete to authenticated
  using (bucket_id = 'etiquetas');

commit;

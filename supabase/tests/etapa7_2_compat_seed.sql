-- Compatibilidad 7.1 → 7.2-A: filas en los cuatro estados de onboarding,
-- escritas ANTES de la migración 20261110000000 y sin conocer la columna
-- nueva. Base DESCARTABLE (ver run_local.sh). Nunca ejecutar en una base real.
\set ON_ERROR_STOP 1
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3'), ('00000000-0000-0000-0000-0000000000f4');
insert into public.profiles (id, nombre) values
  ('00000000-0000-0000-0000-0000000000f1', 'F1'), ('00000000-0000-0000-0000-0000000000f2', 'F2'),
  ('00000000-0000-0000-0000-0000000000f3', 'F3'), ('00000000-0000-0000-0000-0000000000f4', 'F4');
insert into public.user_preferences
  (user_id, preferred_wine_types, preferred_grapes, exploration_open, knowledge_level,
   onboarding_status, onboarding_step, onboarding_resolved_at) values
  ('00000000-0000-0000-0000-0000000000f1', '{}', '{}', false, null, 'never', null, null),
  ('00000000-0000-0000-0000-0000000000f2', '{tinto,blanco}', '{Malbec}', true, 'beginner', 'started', 2, null),
  ('00000000-0000-0000-0000-0000000000f3', '{}', '{}', false, 'advanced', 'completed', 4, now()),
  ('00000000-0000-0000-0000-0000000000f4', '{espumoso}', '{}', false, null, 'skipped', 1, now());

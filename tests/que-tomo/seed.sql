-- =============================================================================
-- Datos SINTÉTICOS para la integración 7.3-A (base descartable). Ningún dato
-- real. Usuarios:
--   X  editor, biblioteca completa (favorito, stock sin tomar, tomado con mala
--      puntuación, tomado sin puntuar), preferencias y conocimiento
--   Y  editor, con un vino propio y conocimiento propio (para aislamiento)
--   V  viewer (sin cava)
--   E  editor, biblioteca vacía y sin preferencias
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000073a1', 'x@prueba.local'),
  ('00000000-0000-0000-0000-0000000073b1', 'y@prueba.local'),
  ('00000000-0000-0000-0000-0000000073c1', 'v@prueba.local'),
  ('00000000-0000-0000-0000-0000000073e1', 'e@prueba.local');

insert into public.profiles (id, nombre, role) values
  ('00000000-0000-0000-0000-0000000073a1', 'X', 'editor'),
  ('00000000-0000-0000-0000-0000000073b1', 'Y', 'admin'),
  ('00000000-0000-0000-0000-0000000073c1', 'V', 'viewer'),
  ('00000000-0000-0000-0000-0000000073e1', 'E', 'editor');

insert into public.wines (id, nombre, bodega, varietal, anada, region, lugar, maridaje, user_id, created_at) values
  ('a0000000-0000-0000-0000-000000000001', 'X Favorito', 'Bodega Uno', 'Malbec', 2020, 'Mendoza', 'Luján de Cuyo', 'Carnes rojas', '00000000-0000-0000-0000-0000000073a1', '2026-10-01'),
  ('a0000000-0000-0000-0000-000000000002', 'X Stock sin tomar', 'Bodega Dos', 'Cabernet Franc', 2021, null, null, null, '00000000-0000-0000-0000-0000000073a1', '2026-10-05'),
  ('a0000000-0000-0000-0000-000000000003', 'X Tomado mal', 'Bodega Tres', 'Torrontés', null, 'Salta', 'Cafayate', 'Empanadas', '00000000-0000-0000-0000-0000000073a1', '2026-09-01'),
  ('a0000000-0000-0000-0000-000000000004', 'X Tomado sin puntuar', null, 'Pinot Noir', 2019, null, null, null, '00000000-0000-0000-0000-0000000073a1', '2026-08-01'),
  ('b0000000-0000-0000-0000-000000000001', 'Y Vino ajeno', 'Bodega Y', 'Syrah', 2018, null, null, null, '00000000-0000-0000-0000-0000000073b1', '2026-10-02');

insert into public.wine_privado (wine_id, user_id, precio, stock, favorito) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073a1', 18000, 2, true),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000073a1', null, 6, false),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000073a1', 9000, 0, false),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000073a1', null, 0, false),
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073b1', 50000, 3, true);

insert into public.consumos (id, wine_id, user_id, fecha, puntuacion, comida, comentario) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073a1', '2026-10-10 21:00', 4.5, 'Asado', 'Muy rico'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073a1', '2026-11-01 21:00', 5, 'Bife', null),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000073a1', '2026-09-10 21:00', 1.5, 'Pescado', 'No me gustó'),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000073a1', '2026-09-20 21:00', null, null, null),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000073a1', '2026-08-10 21:00', null, 'Pastas', null),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073b1', '2026-10-20 21:00', 5, 'Cordero', 'secreto de Y');

insert into public.user_preferences (user_id, preferred_wine_types, exploration_open, preferred_grapes,
  knowledge_level, onboarding_status, onboarding_step, onboarding_resolved_at, wine_types_answer)
values
  ('00000000-0000-0000-0000-0000000073a1', '{tinto}', true, '{malbec,cabernet_franc}', 'intermediate', 'completed', 4, now(), 'answered'),
  ('00000000-0000-0000-0000-0000000073b1', '{blanco}', false, '{}', 'advanced', 'completed', 4, now(), 'answered');

insert into public.user_knowledge (id, user_id, knowledge_type, scope_type, scope_value, wine_id, wine_snapshot, meaning, value, strength, source_type, evidence, status) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000073a1', 'explicit', 'grape', 'torrontes', null, null, 'no le gusta el torrontés', '{"polaridad":"negativa"}', 'strong', 'conversation', null, 'active'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000073a1', 'restriction', 'general', null, null, null, 'sin alcohol los días de semana', null, null, 'conversation', null, 'active'),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000073a1', 'inference', 'wine', null, 'a0000000-0000-0000-0000-000000000001', '{"nombre":"X Favorito"}', 'lo elige para asados', null, 'indication', 'behavior', '{"consumos":["c0000000-0000-0000-0000-000000000001"]}', 'active'),
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000073a1', 'explicit', 'grape', 'syrah', null, null, 'revocado: no debe aparecer', null, null, 'conversation', null, 'revoked'),
  ('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000073b1', 'explicit', 'general', null, null, null, 'conocimiento de Y', null, null, 'conversation', null, 'active');

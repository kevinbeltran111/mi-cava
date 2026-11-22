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

-- =============================================================================
-- 7.4-B1 — «Elegir de mi cava», primera tanda. Usuarios adicionales:
--   S  editor, vinos pero ninguno con stock            → sin_stock
--   R  editor, único vino con stock alcanzado por una
--      restricción confirmada (cepa Malbec)            → excluidos_por_restriccion
--   O  editor, un solo vino elegible y sin señales      → 1 recomendación
--   M  editor, 5 elegibles (uno con 6 botellas), uno
--      excluido por restricción de vino y uno sin stock → 3 recomendaciones
-- (E, sin biblioteca, cubre biblioteca_vacia; X tiene 2 elegibles.)
-- =============================================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000074a1', 's@prueba.local'),
  ('00000000-0000-0000-0000-0000000074b1', 'r@prueba.local'),
  ('00000000-0000-0000-0000-0000000074c1', 'o@prueba.local'),
  ('00000000-0000-0000-0000-0000000074d1', 'm@prueba.local');

insert into public.profiles (id, nombre, role) values
  ('00000000-0000-0000-0000-0000000074a1', 'S', 'editor'),
  ('00000000-0000-0000-0000-0000000074b1', 'R', 'editor'),
  ('00000000-0000-0000-0000-0000000074c1', 'O', 'editor'),
  ('00000000-0000-0000-0000-0000000074d1', 'M', 'editor');

insert into public.wines (id, nombre, bodega, varietal, anada, region, lugar, maridaje, user_id, created_at) values
  ('f4000000-0000-0000-0000-0000000000a1', 'S Tomado', 'Bodega S', 'Merlot', 2020, null, null, null, '00000000-0000-0000-0000-0000000074a1', '2026-10-01'),
  ('f4000000-0000-0000-0000-0000000000a2', 'S Sin fila de stock', null, null, null, null, null, null, '00000000-0000-0000-0000-0000000074a1', '2026-10-02'),
  ('f4000000-0000-0000-0000-0000000000b1', 'R Malbec', 'Bodega R', 'Malbec', 2021, null, null, null, '00000000-0000-0000-0000-0000000074b1', '2026-10-01'),
  ('f4000000-0000-0000-0000-0000000000b2', 'R Sin stock', 'Bodega R', 'Merlot', 2021, null, null, null, '00000000-0000-0000-0000-0000000074b1', '2026-10-02'),
  ('f4000000-0000-0000-0000-0000000000c1', 'O Único', 'Bodega O', null, 2022, null, null, null, '00000000-0000-0000-0000-0000000074c1', '2026-10-01'),
  ('f4000000-0000-0000-0000-0000000000c2', 'O Sin stock', 'Bodega O', 'Syrah', 2022, null, null, null, '00000000-0000-0000-0000-0000000074c1', '2026-10-02'),
  ('f4000000-0000-0000-0000-0000000000d1', 'M Favorito', 'Bodega Norte', 'Merlot', 2020, 'Mendoza', 'Agrelo', null, '00000000-0000-0000-0000-0000000074d1', '2026-10-01'),
  ('f4000000-0000-0000-0000-0000000000d2', 'M Seis botellas', 'Bodega Sur', 'Malbec', 2021, 'Mendoza', 'Gualtallary', null, '00000000-0000-0000-0000-0000000074d1', '2026-10-02'),
  ('f4000000-0000-0000-0000-0000000000d3', 'M Bien puntuado', 'Bodega Este', 'Syrah', 2019, 'San Juan', 'Pedernal', null, '00000000-0000-0000-0000-0000000074d1', '2026-10-03'),
  ('f4000000-0000-0000-0000-0000000000d4', 'M Para explorar', 'Bodega Oeste', 'Pinot Noir', 2022, 'Río Negro', null, null, '00000000-0000-0000-0000-0000000074d1', '2026-09-01'),
  ('f4000000-0000-0000-0000-0000000000d5', 'M Excluido', 'Bodega Centro', 'Bonarda', 2020, null, null, null, '00000000-0000-0000-0000-0000000074d1', '2026-10-05'),
  ('f4000000-0000-0000-0000-0000000000d6', 'M Sin stock', 'Bodega Centro', 'Cabernet Franc', 2018, null, null, null, '00000000-0000-0000-0000-0000000074d1', '2026-10-06'),
  ('f4000000-0000-0000-0000-0000000000d7', 'M Sin puntuar', 'Bodega Alta', 'Tempranillo', 2020, null, null, null, '00000000-0000-0000-0000-0000000074d1', '2026-10-04');

insert into public.wine_privado (wine_id, user_id, precio, stock, favorito) values
  ('f4000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000074a1', 12000, 0, true),
  ('f4000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000074b1', 15000, 2, true),
  ('f4000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000074b1', null, 0, false),
  ('f4000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000074c1', null, 3, false),
  ('f4000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000074c1', 8000, 0, true),
  ('f4000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000074d1', 21000, 1, true),
  ('f4000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000074d1', 14000, 6, false),
  ('f4000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000074d1', 30000, 2, false),
  ('f4000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000074d1', 9500, 1, false),
  ('f4000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000074d1', 11000, 3, true),
  ('f4000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000074d1', 40000, 0, false),
  ('f4000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000074d1', null, 1, false);

insert into public.consumos (id, wine_id, user_id, fecha, puntuacion, comida, comentario) values
  ('f4c00000-0000-0000-0000-0000000000a1', 'f4000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000074a1', '2026-10-10 21:00', 5, null, null),
  ('f4c00000-0000-0000-0000-0000000000d1', 'f4000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000074d1', '2026-10-10 21:00', 4.5, 'Pastas', null),
  ('f4c00000-0000-0000-0000-0000000000d2', 'f4000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000074d1', '2026-10-12 21:00', 5, 'Asado', null),
  ('f4c00000-0000-0000-0000-0000000000d3', 'f4000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000074d1', '2026-10-20 21:00', 4.5, null, null),
  ('f4c00000-0000-0000-0000-0000000000d4', 'f4000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000074d1', '2026-10-15 21:00', 4.5, null, null),
  ('f4c00000-0000-0000-0000-0000000000d5', 'f4000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000074d1', '2026-10-16 21:00', 5, null, null),
  ('f4c00000-0000-0000-0000-0000000000d6', 'f4000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000074d1', '2026-10-17 21:00', 5, null, null),
  ('f4c00000-0000-0000-0000-0000000000d7', 'f4000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000074d1', '2026-10-18 21:00', null, null, null);

insert into public.user_preferences (user_id, preferred_wine_types, exploration_open, preferred_grapes,
  knowledge_level, onboarding_status, onboarding_step, onboarding_resolved_at, wine_types_answer)
values
  ('00000000-0000-0000-0000-0000000074d1', '{tinto}', true, '{pinot_noir,cabernet_franc}', 'intermediate', 'completed', 4, now(), 'answered');

insert into public.user_knowledge (id, user_id, knowledge_type, scope_type, scope_value, wine_id, wine_snapshot, meaning, value, strength, source_type, evidence, status) values
  ('d7400000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000074b1', 'restriction', 'grape', 'malbec', null, null, 'no me recomiendes Malbec', null, null, 'conversation', null, 'active'),
  ('d7400000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000074d1', 'restriction', 'wine', null, 'f4000000-0000-0000-0000-0000000000d5', '{"nombre":"M Excluido"}', 'no me recomiendes este vino', null, null, 'conversation', null, 'active');

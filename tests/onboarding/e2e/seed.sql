-- Datos de prueba E2E de 7.2-B (base DESCARTABLE; nunca en una base real).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e01', 'nuevo@test.local'),
  ('00000000-0000-0000-0000-000000000e02', 'nuevo2@test.local'),
  ('00000000-0000-0000-0000-000000000e03', 'nuevo3@test.local'),
  ('00000000-0000-0000-0000-000000000e10', 'existente@test.local'),
  ('00000000-0000-0000-0000-000000000e11', 'empezado@test.local'),
  ('00000000-0000-0000-0000-000000000e12', 'existente2@test.local'),
  ('00000000-0000-0000-0000-000000000e20', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000e30', 'completo@test.local'),
  ('00000000-0000-0000-0000-000000000e40', 'errores@test.local');
-- e01..e03 sin perfil: pasan por ProfileSetup (usuarios nuevos)
insert into public.profiles (id, nombre, role) values
  ('00000000-0000-0000-0000-000000000e10', 'Ana Existente', 'editor'),
  ('00000000-0000-0000-0000-000000000e11', 'Beto Empezado', 'editor'),
  ('00000000-0000-0000-0000-000000000e12', 'Caro Existente', 'admin'),
  ('00000000-0000-0000-0000-000000000e20', 'Vera Viewer', 'viewer'),
  ('00000000-0000-0000-0000-000000000e30', 'Dani Completo', 'editor'),
  ('00000000-0000-0000-0000-000000000e40', 'Eli Errores', 'editor');
insert into public.wines (id, nombre, bodega, varietal, anada, user_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Gran Reserva de Prueba', 'Bodega Test', 'Malbec', 2019, '00000000-0000-0000-0000-000000000e10'),
  ('a0000000-0000-0000-0000-000000000002', 'Blanco de Prueba', 'Bodega Test', 'Torrontés', 2023, '00000000-0000-0000-0000-000000000e10'),
  ('a0000000-0000-0000-0000-000000000003', 'Espumante de Prueba', 'Bodega Test', 'Chardonnay', null, '00000000-0000-0000-0000-000000000e12');
insert into public.wine_privado (wine_id, user_id, precio, stock, favorito) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000e10', 15000, 2, true),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000e10', null, 0, false),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000e12', null, 1, false);

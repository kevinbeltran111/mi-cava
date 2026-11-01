-- =============================================================================
-- Pruebas de Etapa 7 dentro de UNA transacción que siempre se revierte.
-- =============================================================================
-- Para Supabase local real. Ejecuta etapa7_modelo_inteligencia_test.sql sin
-- modificarlo, entre BEGIN y ROLLBACK:
--   * si todas las pruebas pasan, el ROLLBACK final descarta los datos
--     ficticios, el esquema "tests" y todo lo creado;
--   * si alguna falla, el archivo de pruebas aborta con error, psql termina
--     (ON_ERROR_STOP) y la transacción abierta se descarta al cerrar la
--     conexión.
--
-- Única excepción: las secuencias no son transaccionales. La prueba usa
-- setval/nextval sobre public.analytics_alias_seq; run_supabase_local.ps1
-- guarda su estado antes y lo restaura después.
--
-- Debe estar en el mismo directorio que etapa7_modelo_inteligencia_test.sql.
-- =============================================================================

\set ON_ERROR_STOP 1

begin;

\ir etapa7_modelo_inteligencia_test.sql

rollback;

\echo 'TRANSACCION DE PRUEBAS REVERTIDA (ROLLBACK)'

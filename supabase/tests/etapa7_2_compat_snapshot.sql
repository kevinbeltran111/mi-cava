-- Huella de las filas de user_preferences con las columnas de 7.1
-- (sin la columna nueva). Solo lectura.
select md5(string_agg(row(user_id, preferred_wine_types, preferred_grapes, exploration_open,
                          knowledge_level, onboarding_status, onboarding_step,
                          onboarding_resolved_at, created_at, updated_at)::text, '|' order by user_id))
       || ' filas=' || count(*)
from public.user_preferences;

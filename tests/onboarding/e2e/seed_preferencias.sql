-- Filas de preferencias del E2E (requieren la migración 7.2-A).
insert into public.user_preferences (user_id, wine_types_answer, preferred_wine_types, preferred_grapes,
                                     onboarding_status, onboarding_step) values
  ('00000000-0000-0000-0000-000000000e11', 'answered', '{espumoso}', '{glera}', 'started', 2);
insert into public.user_preferences (user_id, wine_types_answer, preferred_wine_types, preferred_grapes,
                                     knowledge_level, onboarding_status, onboarding_step, onboarding_resolved_at) values
  ('00000000-0000-0000-0000-000000000e30', 'answered', '{tinto}', '{malbec}', 'intermediate', 'completed', 4,
   '2026-11-01 12:00:00+00');

-- =============================================================================
-- ETAPA 7 — FASE 7.1: MODELO DE DATOS DE INTELIGENCIA
-- =============================================================================
-- Crea seis tablas nuevas en public. No modifica ninguna tabla, función,
-- policy ni privilegio existente.
--
--   user_preferences         preferencias declaradas + estado del onboarding
--   user_knowledge           conocimiento persistente (explícito, restricciones,
--                            inferencias) con evidencia
--   recommendation_sessions  una interacción completa con "¿Qué tomo?"
--   recommendation_items     una fila por botella recomendada (snapshot)
--   recommendation_events    reacciones y acciones posteriores (append-only)
--   analytics_identity       identidad pseudonimizada para analítica
--
-- Principio: se guardan hechos y señales originales; las inferencias conservan
-- su evidencia y pueden reconstruirse. No se duplican datos que ya tienen
-- fuente de verdad (wines, wine_privado, consumos, profiles, Auth).
--
-- Superficie para el cliente autenticado:
--   user_preferences   SELECT / INSERT / UPDATE de la propia fila
--   user_knowledge     SELECT del propio conocimiento
--   recommendation_*   SELECT de lo que pertenece a sesiones propias
--   analytics_identity sin acceso
-- Todas las demás escrituras quedan reservadas a service_role (código de
-- servidor). anon no tiene ningún privilegio sobre estas tablas.
--
-- Privilegios: en producción las tablas nuevas reciben por defecto TRUNCATE,
-- REFERENCES, TRIGGER y MAINTAIN para los roles de la API y las funciones
-- nuevas solo son ejecutables por postgres (supabase/README.md). Este archivo
-- hace REVOKE ALL y otorga explícitamente solo lo necesario, para que el
-- resultado no dependa de los default privileges del proyecto.
--
-- Una sola función es SECURITY DEFINER: intel_check_wine_owner(), función de
-- trigger cuya única tarea privilegiada es verificar que un wine_id pertenezca
-- al mismo usuario (service_role no tiene SELECT sobre wines y no se amplía).
-- No es invocable por RPC ni ejecutable por ningún rol de la API, y no
-- devuelve datos de wines. Las demás funciones de trigger son SECURITY INVOKER
-- y no leen otras tablas.
--
-- Requiere los baselines 20261010000000 y 20261010000001 ya aplicados.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Guardas
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.wines') is null or to_regclass('public.profiles') is null then
    raise exception 'Migración 20261025000000 no aplicada: falta el esquema base '
      '(public.wines / public.profiles). Aplicar antes los baselines.';
  end if;
  if to_regclass('public.user_preferences') is not null
     or to_regclass('public.user_knowledge') is not null
     or to_regclass('public.recommendation_sessions') is not null
     or to_regclass('public.recommendation_items') is not null
     or to_regclass('public.recommendation_events') is not null
     or to_regclass('public.analytics_identity') is not null then
    raise exception 'Migración 20261025000000 no aplicada: alguna de las tablas '
      'de Etapa 7 ya existe.';
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 1. Funciones de trigger (SECURITY INVOKER, search_path vacío)
-- -----------------------------------------------------------------------------

-- created_at / updated_at los fija la base, no quien escribe.
create function public.intel_set_timestamps()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- user_knowledge:
--   * al crear un conocimiento de scope 'wine' se exige wine_id;
--   * user_id y scope_type no cambian;
--   * wine_id solo puede quedar igual o pasar a NULL. Esto último es lo que
--     hace la FK ON DELETE SET NULL cuando se borra el vino; el registro
--     sigue siendo legible por wine_snapshot.
create function public.intel_knowledge_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.scope_type = 'wine' and new.wine_id is null then
      raise exception 'Un conocimiento de scope wine requiere wine_id al crearse'
        using errcode = '23514';
    end if;
  else
    if new.user_id is distinct from old.user_id
       or new.scope_type is distinct from old.scope_type then
      raise exception 'user_id y scope_type de un conocimiento no se modifican'
        using errcode = '23514';
    end if;
    if new.wine_id is not null and new.wine_id is distinct from old.wine_id then
      raise exception 'wine_id de un conocimiento no se reasigna'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

-- recommendation_items: un item 'owned' se crea con wine_id. Si después se
-- borra el vino, la FK lo pone en NULL y el item conserva wine_identity.
create function public.intel_item_guard()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.relationship = 'owned' and new.wine_id is null then
    raise exception 'Un item owned requiere wine_id al crearse'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

-- Pertenencia del vino (SECURITY DEFINER, solo como trigger).
--   user_knowledge:       wines.user_id = user_knowledge.user_id
--   recommendation_items: wines.user_id = recommendation_sessions.user_id
-- Se dispara solo cuando hay wine_id. Vino inexistente o ajeno producen el
-- mismo error, sin revelar a quién pertenece el vino.
create function public.intel_check_wine_owner()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_owner      uuid;
  v_wine_owner uuid;
begin
  if new.wine_id is null then
    return new;
  end if;

  if tg_table_name = 'user_knowledge' then
    v_owner := new.user_id;
  elsif tg_table_name = 'recommendation_items' then
    select s.user_id into v_owner
    from public.recommendation_sessions s
    where s.id = new.session_id;
  else
    raise exception 'intel_check_wine_owner: tabla no soportada';
  end if;

  select w.user_id into v_wine_owner
  from public.wines w
  where w.id = new.wine_id;

  if v_owner is null or v_wine_owner is null or v_wine_owner <> v_owner then
    raise exception 'El vino referenciado no pertenece al usuario'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- recommendation_events es append-only: ninguna fila se modifica.
-- Las bajas solo ocurren por cascada desde la sesión o el item.
create function public.intel_events_append_only()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  raise exception 'recommendation_events es append-only: no se modifican eventos'
    using errcode = '42501';
end;
$function$;

-- analytics_identity: analytics_id, display_alias y created_at los asigna la
-- base, ignorando cualquier valor recibido. Alias: "Tester 007"; desde 1000
-- crece a 4 o más dígitos sin truncar.
create function public.intel_assign_analytics_identity()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  n bigint;
begin
  n := nextval('public.analytics_alias_seq');
  new.analytics_id  := gen_random_uuid();
  new.display_alias := 'Tester ' || lpad(n::text, greatest(3, length(n::text)), '0');
  new.created_at    := now();
  return new;
end;
$function$;


-- -----------------------------------------------------------------------------
-- 2. Tablas
-- -----------------------------------------------------------------------------

-- 2.1 Preferencias declaradas por el usuario y estado del onboarding.
-- "Me gusta probar de todo" es exploration_open; no equivale a elegir todos
-- los tipos.
create table public.user_preferences (
  user_id                 uuid        not null,
  preferred_wine_types    text[]      not null default '{}',
  preferred_grapes        text[]      not null default '{}',
  exploration_open        boolean     not null default false,
  knowledge_level         text,
  onboarding_status       text        not null default 'never',
  onboarding_step         smallint,
  onboarding_resolved_at  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint user_preferences_pkey primary key (user_id),
  constraint user_preferences_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint user_preferences_wine_types_check
    check (preferred_wine_types <@ array['tinto', 'blanco', 'rosado', 'naranjo', 'espumoso']::text[]),
  constraint user_preferences_grapes_check
    check (array_position(preferred_grapes, null) is null
           and not ('' = any (preferred_grapes))),
  constraint user_preferences_knowledge_level_check
    check (knowledge_level is null
           or knowledge_level in ('beginner', 'intermediate', 'advanced')),
  constraint user_preferences_onboarding_status_check
    check (onboarding_status in ('never', 'started', 'completed', 'skipped')),
  constraint user_preferences_onboarding_step_check
    check (onboarding_step is null or onboarding_step >= 0),
  -- completed y skipped resuelven el onboarding (no vuelve a mostrarse
  -- automáticamente) y registran cuándo; never y started no.
  constraint user_preferences_resolved_at_check
    check (
      (onboarding_status in ('never', 'started') and onboarding_resolved_at is null)
      or (onboarding_status in ('completed', 'skipped') and onboarding_resolved_at is not null)
    )
);

-- 2.2 Conocimiento persistente sobre el usuario.
-- wine_id es opcional y se pone en NULL si el vino se borra; para scope 'wine'
-- wine_snapshot conserva la identidad del vino y mantiene legible el registro.
create table public.user_knowledge (
  id             uuid        not null default gen_random_uuid(),
  user_id        uuid        not null,
  knowledge_type text        not null,
  scope_type     text        not null,
  scope_value    text,
  wine_id        uuid,
  wine_snapshot  jsonb,
  meaning        text        not null,
  value          jsonb,
  strength       text,
  source_type    text        not null,
  evidence       jsonb,
  status         text        not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_knowledge_pkey primary key (id),
  constraint user_knowledge_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint user_knowledge_wine_id_fkey foreign key (wine_id)
    references public.wines (id) on delete set null,
  constraint user_knowledge_type_check
    check (knowledge_type in ('explicit', 'restriction', 'inference')),
  constraint user_knowledge_scope_type_check
    check (scope_type in ('general', 'wine_type', 'grape', 'winery', 'wine')),
  constraint user_knowledge_source_type_check
    check (source_type in ('onboarding', 'conversation', 'behavior', 'recommender')),
  constraint user_knowledge_status_check
    check (status in ('active', 'superseded', 'revoked')),
  constraint user_knowledge_meaning_check
    check (length(btrim(meaning)) > 0),
  -- scope_value según scope
  constraint user_knowledge_scope_value_check
    check (
      case scope_type
        when 'general'   then scope_value is null
        when 'wine_type' then scope_value in ('tinto', 'blanco', 'rosado', 'naranjo', 'espumoso')
        when 'grape'     then length(btrim(coalesce(scope_value, ''))) > 0
        when 'winery'    then length(btrim(coalesce(scope_value, ''))) > 0
        when 'wine'      then scope_value is null or length(btrim(scope_value)) > 0
      end
    ),
  -- wine_id solo para scope 'wine'. La exigencia de wine_id al crear vive en
  -- el trigger intel_knowledge_guard, para no bloquear el SET NULL posterior.
  constraint user_knowledge_wine_id_scope_check
    check (wine_id is null or scope_type = 'wine'),
  -- snapshot obligatorio para scope 'wine' (objeto con "nombre" no vacío);
  -- prohibido en los demás scopes.
  constraint user_knowledge_wine_snapshot_check
    check (
      case
        when scope_type = 'wine' then
          wine_snapshot is not null
          and jsonb_typeof(wine_snapshot) = 'object'
          and length(btrim(coalesce(wine_snapshot ->> 'nombre', ''))) > 0
        else wine_snapshot is null
      end
    ),
  constraint user_knowledge_strength_check
    check (strength is null or strength in ('indication', 'relevant', 'strong')),
  constraint user_knowledge_evidence_check
    check (evidence is null or jsonb_typeof(evidence) in ('object', 'array')),
  -- toda inferencia conserva evidencia no vacía
  constraint user_knowledge_inference_evidence_check
    check (
      knowledge_type <> 'inference'
      or (evidence is not null and evidence <> '{}'::jsonb and evidence <> '[]'::jsonb)
    )
);

-- 2.3 Sesiones de "¿Qué tomo?". El contexto es temporal de la sesión.
create table public.recommendation_sessions (
  id                  uuid        not null default gen_random_uuid(),
  user_id             uuid        not null,
  mode                text        not null,
  status              text        not null default 'active',
  initial_input       text,
  context             jsonb       not null default '{}'::jsonb,
  context_sufficiency text,
  questions_count     smallint    not null default 0,
  engine_version      text,
  model               text,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  constraint recommendation_sessions_pkey primary key (id),
  constraint recommendation_sessions_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint recommendation_sessions_mode_check
    check (mode in ('food', 'cellar', 'discovery')),
  constraint recommendation_sessions_status_check
    check (status in ('active', 'completed', 'abandoned', 'error')),
  constraint recommendation_sessions_sufficiency_check
    check (context_sufficiency is null
           or context_sufficiency in ('insufficient', 'partial', 'sufficient')),
  constraint recommendation_sessions_context_check
    check (jsonb_typeof(context) = 'object'),
  constraint recommendation_sessions_questions_check
    check (questions_count >= 0),
  -- una sesión activa no tiene cierre; una cerrada sí, y no antes del inicio
  constraint recommendation_sessions_ended_at_check
    check (
      (status = 'active' and ended_at is null)
      or (status <> 'active' and ended_at is not null and ended_at >= started_at)
    )
);

-- 2.4 Botellas recomendadas. Cada fila es un snapshot histórico:
-- wine_identity guarda siempre la identidad del vino tal como se recomendó,
-- también para vinos propios (wine_id se pone en NULL si el vino se borra).
create table public.recommendation_items (
  id               uuid        not null default gen_random_uuid(),
  session_id       uuid        not null,
  batch_no         smallint    not null,
  position         smallint    not null,
  relationship     text        not null,
  wine_id          uuid,
  wine_identity    jsonb       not null,
  external_vintage integer,
  price_min        numeric,
  price_max        numeric,
  currency         text,
  grounding        jsonb,
  signals          jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint recommendation_items_pkey primary key (id),
  -- (id, session_id) es destino de la FK compuesta de recommendation_events
  constraint recommendation_items_id_session_key unique (id, session_id),
  constraint recommendation_items_slot_key unique (session_id, batch_no, position),
  constraint recommendation_items_session_id_fkey foreign key (session_id)
    references public.recommendation_sessions (id) on delete cascade,
  constraint recommendation_items_wine_id_fkey foreign key (wine_id)
    references public.wines (id) on delete set null,
  constraint recommendation_items_batch_check check (batch_no >= 1),
  constraint recommendation_items_position_check check (position between 1 and 3),
  constraint recommendation_items_relationship_check
    check (relationship in ('owned', 'known', 'new')),
  constraint recommendation_items_wine_identity_check
    check (jsonb_typeof(wine_identity) = 'object'
           and length(btrim(coalesce(wine_identity ->> 'nombre', ''))) > 0),
  -- un vino nuevo no es un vino propio
  constraint recommendation_items_new_check
    check (relationship <> 'new' or wine_id is null),
  constraint recommendation_items_vintage_check
    check (external_vintage is null or external_vintage > 0),
  constraint recommendation_items_price_check
    check ((price_min is null or price_min >= 0)
           and (price_max is null or price_max >= 0)
           and (price_min is null or price_max is null or price_min <= price_max)),
  constraint recommendation_items_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint recommendation_items_price_currency_check
    check ((price_min is null and price_max is null) or currency is not null),
  constraint recommendation_items_grounding_check
    check (grounding is null or jsonb_typeof(grounding) in ('object', 'array')),
  constraint recommendation_items_signals_check
    check (jsonb_typeof(signals) in ('object', 'array'))
);

-- 2.5 Eventos (append-only). Si referencian un item, la FK compuesta garantiza
-- que el item pertenece a la misma sesión.
create table public.recommendation_events (
  id                     uuid        not null default gen_random_uuid(),
  session_id             uuid        not null,
  recommendation_item_id uuid,
  event_type             text        not null,
  payload                jsonb       not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  constraint recommendation_events_pkey primary key (id),
  constraint recommendation_events_session_id_fkey foreign key (session_id)
    references public.recommendation_sessions (id) on delete cascade,
  constraint recommendation_events_item_fkey
    foreign key (recommendation_item_id, session_id)
    references public.recommendation_items (id, session_id) on delete cascade,
  constraint recommendation_events_type_check
    check (event_type in ('shown', 'selected', 'dismissed', 'cheaper_requested',
                          'bolder_requested', 'new_batch', 'thumbs_up',
                          'thumbs_down', 'bottle_opened')),
  constraint recommendation_events_payload_check
    check (jsonb_typeof(payload) = 'object')
);

-- 2.6 Identidad pseudonimizada para analítica. Sin email, nombre ni datos de
-- la cava. Los valores los asigna el trigger.
create sequence public.analytics_alias_seq as bigint start with 1 minvalue 1 no cycle;

create table public.analytics_identity (
  user_id       uuid        not null,
  analytics_id  uuid        not null default gen_random_uuid(),
  display_alias text        not null,
  created_at    timestamptz not null default now(),
  constraint analytics_identity_pkey primary key (user_id),
  constraint analytics_identity_analytics_id_key unique (analytics_id),
  constraint analytics_identity_display_alias_key unique (display_alias),
  constraint analytics_identity_user_id_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade
);


-- -----------------------------------------------------------------------------
-- 3. Índices (además de los implícitos de PK y UNIQUE)
-- -----------------------------------------------------------------------------
-- recommendation_items(session_id, batch_no) queda cubierto por el UNIQUE
-- (session_id, batch_no, position).

-- carga del conocimiento activo de un usuario
create index idx_user_knowledge_user_status
  on public.user_knowledge using btree (user_id, status);

-- FK con SET NULL: evita recorrer la tabla al borrar un vino
create index idx_user_knowledge_wine
  on public.user_knowledge using btree (wine_id) where wine_id is not null;

create index idx_recommendation_sessions_user_started
  on public.recommendation_sessions using btree (user_id, started_at desc);

create index idx_recommendation_items_wine
  on public.recommendation_items using btree (wine_id) where wine_id is not null;

create index idx_recommendation_events_session_created
  on public.recommendation_events using btree (session_id, created_at);

-- cubre la FK compuesta (recommendation_item_id, session_id) → items
create index idx_recommendation_events_item
  on public.recommendation_events using btree (recommendation_item_id, session_id)
  where recommendation_item_id is not null;


-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

create trigger trg_user_preferences_timestamps
  before insert or update on public.user_preferences
  for each row execute function public.intel_set_timestamps();

create trigger trg_user_knowledge_timestamps
  before insert or update on public.user_knowledge
  for each row execute function public.intel_set_timestamps();

create trigger trg_user_knowledge_guard
  before insert or update on public.user_knowledge
  for each row execute function public.intel_knowledge_guard();

create trigger trg_recommendation_items_guard
  before insert on public.recommendation_items
  for each row execute function public.intel_item_guard();

create trigger trg_user_knowledge_wine_owner
  before insert or update of wine_id, user_id on public.user_knowledge
  for each row when (new.wine_id is not null)
  execute function public.intel_check_wine_owner();

create trigger trg_recommendation_items_wine_owner
  before insert or update of wine_id, session_id on public.recommendation_items
  for each row when (new.wine_id is not null)
  execute function public.intel_check_wine_owner();

create trigger trg_recommendation_events_append_only
  before update on public.recommendation_events
  for each row execute function public.intel_events_append_only();

create trigger trg_analytics_identity_assign
  before insert on public.analytics_identity
  for each row execute function public.intel_assign_analytics_identity();


-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.user_preferences        enable row level security;
alter table public.user_knowledge          enable row level security;
alter table public.recommendation_sessions enable row level security;
alter table public.recommendation_items    enable row level security;
alter table public.recommendation_events   enable row level security;
alter table public.analytics_identity      enable row level security;


-- -----------------------------------------------------------------------------
-- 6. Policies (para authenticated; service_role no las necesita: BYPASSRLS)
-- -----------------------------------------------------------------------------
-- (select auth.uid()) se evalúa una vez por consulta, no por fila.

-- user_preferences: lectura, alta y edición de la propia fila. Sin DELETE.
create policy "user_preferences: cada uno ve la suya" on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "user_preferences: cada uno crea la suya" on public.user_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "user_preferences: cada uno edita la suya" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- user_knowledge: solo lectura del propio conocimiento.
create policy "user_knowledge: cada uno ve el suyo" on public.user_knowledge
  for select to authenticated
  using (user_id = (select auth.uid()));

-- recommendation_sessions: solo lectura de sesiones propias.
create policy "recommendation_sessions: cada uno ve las suyas" on public.recommendation_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- recommendation_items / events: lectura si la sesión es propia.
create policy "recommendation_items: de sesiones propias" on public.recommendation_items
  for select to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = recommendation_items.session_id
      and s.user_id = (select auth.uid())
  ));
create policy "recommendation_events: de sesiones propias" on public.recommendation_events
  for select to authenticated
  using (exists (
    select 1 from public.recommendation_sessions s
    where s.id = recommendation_events.session_id
      and s.user_id = (select auth.uid())
  ));

-- analytics_identity: sin policies. Solo service_role (BYPASSRLS).


-- -----------------------------------------------------------------------------
-- 7. Privilegios
-- -----------------------------------------------------------------------------

revoke all on table
  public.user_preferences, public.user_knowledge, public.recommendation_sessions,
  public.recommendation_items, public.recommendation_events, public.analytics_identity
  from public, anon, authenticated, service_role;

-- authenticated
grant select, insert, update on table public.user_preferences        to authenticated;
grant select                 on table public.user_knowledge          to authenticated;
grant select                 on table public.recommendation_sessions to authenticated;
grant select                 on table public.recommendation_items    to authenticated;
grant select                 on table public.recommendation_events   to authenticated;

-- service_role (código de servidor). Sin DELETE: las bajas son por cascada.
grant select                 on table public.user_preferences        to service_role;
grant select, insert, update on table public.user_knowledge          to service_role;
grant select, insert, update on table public.recommendation_sessions to service_role;
grant select, insert         on table public.recommendation_items    to service_role;
grant select, insert         on table public.recommendation_events   to service_role;
grant select, insert         on table public.analytics_identity      to service_role;

-- Secuencia de alias: la usa el trigger con los privilegios de quien inserta.
revoke all on sequence public.analytics_alias_seq from public, anon, authenticated, service_role;
grant usage on sequence public.analytics_alias_seq to service_role;

-- Funciones de trigger: no se invocan por RPC. EXECUTE se verifica al crear
-- el trigger, no al dispararlo, así que nadie más lo necesita. Esto incluye
-- a intel_check_wine_owner (SECURITY DEFINER).
revoke all on function
  public.intel_set_timestamps(),
  public.intel_knowledge_guard(),
  public.intel_item_guard(),
  public.intel_check_wine_owner(),
  public.intel_events_append_only(),
  public.intel_assign_analytics_identity()
  from public, anon, authenticated, service_role;

commit;

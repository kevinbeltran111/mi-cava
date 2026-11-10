-- Huella del catálogo de los objetos creados por Etapa 7.1
-- (20261025000000). La usa run_local.sh antes y después de las migraciones
-- posteriores para verificar qué cambian. Mismo formato que
-- baseline_fingerprint.sql. Solo lectura.
with e7_tables(t) as (
  values ('user_preferences'), ('user_knowledge'), ('recommendation_sessions'),
         ('recommendation_items'), ('recommendation_events'), ('analytics_identity')
), rels as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join e7_tables e on e.t = c.relname
  where c.relnamespace = 'public'::regnamespace
)
select line from (
  select 'table|' || relname || '|rls=' || relrowsecurity || '|force=' || relforcerowsecurity
         || '|acl=' || coalesce(relacl::text, '') as line
  from rels
  union all
  select 'column|' || r.relname || '|' || a.attname || '|' || format_type(a.atttypid, a.atttypmod)
         || '|notnull=' || a.attnotnull || '|default=' || coalesce(pg_get_expr(d.adbin, d.adrelid), '')
         || '|acl=' || coalesce(a.attacl::text, '')
  from rels r
  join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select 'constraint|' || r.relname || '|' || co.conname || '|' || pg_get_constraintdef(co.oid)
  from rels r join pg_constraint co on co.conrelid = r.oid
  union all
  select 'index|' || r.relname || '|' || pg_get_indexdef(i.indexrelid)
  from rels r join pg_index i on i.indrelid = r.oid
  union all
  select 'trigger|' || r.relname || '|' || pg_get_triggerdef(tg.oid)
  from rels r join pg_trigger tg on tg.tgrelid = r.oid and not tg.tgisinternal
  union all
  select 'policy|' || p.tablename || '|' || p.policyname || '|' || p.cmd
         || '|' || p.roles::text || '|' || coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')
  from pg_policies p
  where p.schemaname = 'public' and p.tablename in (select t from e7_tables)
  union all
  select 'function|' || p.oid::regprocedure::text || '|secdef=' || p.prosecdef
         || '|acl=' || coalesce(p.proacl::text, '') || '|' || md5(replace(p.prosrc, E'\r', ''))
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname like 'intel\_%'
  union all
  select 'sequence|' || c.relname || '|acl=' || coalesce(c.relacl::text, '')
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = 'analytics_alias_seq'
) x
order by line;

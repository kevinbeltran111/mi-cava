-- Huella del catálogo de los objetos definidos por los baselines.
-- La usa run_local.sh para verificar que una migración posterior no los altera.
-- Solo lectura.
with base_tables(t) as (
  values ('profiles'), ('wines'), ('wine_privado'), ('consumos'), ('ratings'),
         ('access_requests'), ('role_audit_log')
), rels as (
  select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
  from pg_class c join base_tables b on b.t = c.relname
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
  select 'policy|' || p.schemaname || '.' || p.tablename || '|' || p.policyname || '|' || p.cmd
         || '|' || p.roles::text || '|' || coalesce(p.qual, '') || '|' || coalesce(p.with_check, '')
  from pg_policies p
  where (p.schemaname = 'public' and p.tablename in (select t from base_tables))
     or (p.schemaname = 'storage')
  union all
  select 'function|' || p.oid::regprocedure::text || '|secdef=' || p.prosecdef
         || '|acl=' || coalesce(p.proacl::text, '') || '|' || md5(p.prosrc)
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('is_admin', 'can_edit', 'admin_list_users', 'admin_set_role',
                      'registrar_consumo', 'prevent_role_self_escalation',
                      'prevent_last_admin_removal', 'prevent_consumo_reassignment')
  union all
  select 'bucket|' || id || '|' || name || '|' || coalesce(public::text, '')
  from storage.buckets
) x
order by line;

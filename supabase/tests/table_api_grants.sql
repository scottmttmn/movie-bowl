-- Every table in public says who may use it through the Data API.
--
-- Since October 30, 2026 Supabase no longer grants a new table's rows to anon,
-- authenticated or service_role by default, and 00_platform.sql revokes the
-- same defaults. A migration that forgets its grants therefore leaves a table
-- that nothing but a security definer function can reach -- which is right for
-- a handful of tables and a silent outage for any other. This names the
-- handful, so a forgotten grant shows up here rather than as `permission
-- denied` on a newly built project.
begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(3);

select is(
  array(
    select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from unnest(array['anon', 'authenticated', 'service_role']) as r(role)
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(privilege)
        where has_table_privilege(r.role, c.oid, p.privilege)
      )
    order by 1
  ),
  array[
    'feedback_reports',
    'service_usage_counters',
    'tv_pairing_rate_limits'
  ]::text[],
  'only the sealed tables have no row grant to any API role'
);

-- The test above is only as good as the defaults it runs under, so pin those
-- to what Supabase now does: a new table's rows are reachable by no API role.
create table public.grants_probe (id int);

select ok(
  not has_table_privilege('anon', 'public.grants_probe', 'SELECT')
    and not has_table_privilege('authenticated', 'public.grants_probe', 'SELECT')
    and not has_table_privilege('service_role', 'public.grants_probe', 'SELECT')
    and not has_table_privilege('authenticated', 'public.grants_probe', 'INSERT')
    and not has_table_privilege('service_role', 'public.grants_probe', 'INSERT'),
  'a new table is born without row grants, as on Supabase'
);

select ok(
  has_table_privilege('service_role', 'public.grants_probe', 'TRUNCATE'),
  'and keeps the truncate, references and trigger defaults Supabase left'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

select has_table(
  'public',
  'tmdb_filter_metadata_refresh_runs',
  'the private refresh-run history exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.tmdb_filter_metadata_refresh_runs'::regclass
  ),
  'refresh-run history has row level security enabled'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.tmdb_filter_metadata_refresh_runs',
    'SELECT'
  ) and not has_table_privilege(
    'anon',
    'public.tmdb_filter_metadata_refresh_runs',
    'INSERT'
  ),
  'anonymous clients cannot access refresh-run history'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.tmdb_filter_metadata_refresh_runs',
    'SELECT'
  ) and not has_table_privilege(
    'authenticated',
    'public.tmdb_filter_metadata_refresh_runs',
    'INSERT'
  ),
  'authenticated clients cannot access refresh-run history'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.tmdb_filter_metadata_refresh_runs',
    'SELECT'
  ),
  'the server service role can read refresh-run history'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_tmdb_filter_metadata_refresh_run(text,text,timestamp with time zone,timestamp with time zone,integer,integer,integer,boolean,integer,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot record refresh runs'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_tmdb_filter_metadata_refresh_run(text,text,timestamp with time zone,timestamp with time zone,integer,integer,integer,boolean,integer,text)',
    'EXECUTE'
  ),
  'the server service role can record refresh runs'
);

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000091', 'report-owner@example.com');

insert into public.profiles (id, email)
values (
  '00000000-0000-4000-8000-000000000091',
  'report-owner@example.com'
);

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-4000-8000-000000000091',
  'Refresh Report Bowl',
  '00000000-0000-4000-8000-000000000091'
);

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values (
  '20000000-0000-4000-8000-000000000091',
  '10000000-0000-4000-8000-000000000091',
  '00000000-0000-4000-8000-000000000091',
  9101,
  'Pending Refresh Movie'
);

select is(
  (
    select count(*)::integer
    from public.tmdb_filter_metadata
    where tmdb_id = 9101
      and fetched_at is null
  ),
  1,
  'the fixture contributes one missing metadata snapshot'
);

insert into public.tmdb_filter_metadata_refresh_runs (
  region,
  status,
  started_at,
  completed_at,
  claimed,
  succeeded,
  failed,
  exhausted,
  elapsed_ms,
  remaining_stale,
  error
) values (
  'US',
  'completed',
  now() - interval '100 days 1 minute',
  now() - interval '100 days',
  0,
  0,
  0,
  true,
  60000,
  0,
  null
);

set local role service_role;

create temporary table recorded_refresh_run on commit drop as
select *
from public.record_tmdb_filter_metadata_refresh_run(
  'US',
  'completed',
  now() - interval '1 minute',
  now(),
  3,
  2,
  1,
  false,
  1234,
  null
);

select ok(
  (select run_id is not null from recorded_refresh_run),
  'recording returns the persisted run ID'
);

select is(
  (select remaining_stale from recorded_refresh_run),
  1,
  'recording reports the current stale backlog'
);

select is(
  (
    select status
    from public.tmdb_filter_metadata_refresh_runs
    where id = (select run_id from recorded_refresh_run)
  ),
  'completed',
  'the completed run status is stored'
);

select is(
  (
    select succeeded
    from public.tmdb_filter_metadata_refresh_runs
    where id = (select run_id from recorded_refresh_run)
  ),
  2,
  'the daily refreshed-title count is stored'
);

select is(
  (
    select failed
    from public.tmdb_filter_metadata_refresh_runs
    where id = (select run_id from recorded_refresh_run)
  ),
  1,
  'the daily failed-title count is stored'
);

select is(
  (
    select elapsed_ms
    from public.tmdb_filter_metadata_refresh_runs
    where id = (select run_id from recorded_refresh_run)
  ),
  1234,
  'the run duration is stored'
);

select is(
  (
    select remaining_stale
    from public.tmdb_filter_metadata_refresh_runs
    where id = (select run_id from recorded_refresh_run)
  ),
  1,
  'the persisted row includes the remaining backlog'
);

select is(
  (
    select count(*)::integer
    from public.tmdb_filter_metadata_refresh_runs
    where completed_at < now() - interval '90 days'
  ),
  0,
  'recording a run prunes history older than 90 days'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(25);

select has_table(
  'public',
  'tmdb_filter_metadata',
  'the shared TMDB filter metadata cache exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tmdb_filter_metadata'::regclass),
  'the filter metadata cache has row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'public.tmdb_filter_metadata', 'SELECT')
    and not has_table_privilege('anon', 'public.tmdb_filter_metadata', 'INSERT')
    and not has_table_privilege('anon', 'public.tmdb_filter_metadata', 'UPDATE'),
  'anonymous clients cannot access the cache table directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.tmdb_filter_metadata', 'SELECT')
    and not has_table_privilege('authenticated', 'public.tmdb_filter_metadata', 'INSERT')
    and not has_table_privilege('authenticated', 'public.tmdb_filter_metadata', 'UPDATE'),
  'authenticated clients cannot access the cache table directly'
);

select ok(
  has_table_privilege('service_role', 'public.tmdb_filter_metadata', 'SELECT')
    and has_table_privilege('service_role', 'public.tmdb_filter_metadata', 'INSERT')
    and has_table_privilege('service_role', 'public.tmdb_filter_metadata', 'UPDATE'),
  'the server service role can maintain the cache'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_bowl_filter_metadata(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can call the membership-checked bowl metadata RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_bowl_filter_metadata(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot call the bowl metadata RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_tmdb_filter_metadata_refreshes(integer,text,timestamp with time zone,bigint,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim background refresh work'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.claim_tmdb_filter_metadata_refreshes(integer,text,timestamp with time zone,bigint,uuid,uuid)',
    'EXECUTE'
  ),
  'the service role can claim background refresh work'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000081', 'cache-owner@example.com'),
  ('00000000-0000-4000-8000-000000000082', 'cache-member@example.com'),
  ('00000000-0000-4000-8000-000000000083', 'cache-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-4000-8000-000000000081',
  '00000000-0000-4000-8000-000000000082',
  '00000000-0000-4000-8000-000000000083'
);

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-4000-8000-000000000081',
  'Cache Bowl',
  '00000000-0000-4000-8000-000000000081'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000081',
    '00000000-0000-4000-8000-000000000081',
    'Owner'
  ),
  (
    '10000000-0000-4000-8000-000000000081',
    '00000000-0000-4000-8000-000000000082',
    'Member'
  );

insert into public.bowl_movies (
  id, bowl_id, added_by, tmdb_id, title
)
values
  (
    '20000000-0000-4000-8000-000000000081',
    '10000000-0000-4000-8000-000000000081',
    '00000000-0000-4000-8000-000000000081',
    8101,
    'Cached Movie'
  ),
  (
    '20000000-0000-4000-8000-000000000082',
    '10000000-0000-4000-8000-000000000081',
    '00000000-0000-4000-8000-000000000082',
    -8102,
    'Custom Movie'
  );

select is(
  (
    select count(*)::integer
    from public.tmdb_filter_metadata
    where tmdb_id = 8101
      and region = 'US'
  ),
  1,
  'adding an active TMDB movie seeds one global cache placeholder'
);

select is(
  (
    select count(*)::integer
    from public.tmdb_filter_metadata
    where tmdb_id = -8102
  ),
  0,
  'custom movies never enter the TMDB cache'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000082","email":"cache-member@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000082',
  true
);

select is(
  (
    select count(*)::integer
    from public.get_bowl_filter_metadata(
      '10000000-0000-4000-8000-000000000081',
      'US'
    )
  ),
  1,
  'a bowl member receives only the active TMDB title'
);

select is(
  (
    select fetched_at
    from public.get_bowl_filter_metadata(
      '10000000-0000-4000-8000-000000000081',
      'US'
    )
    where tmdb_id = 8101
  ),
  null::timestamptz,
  'a never-refreshed title is distinguishable from confirmed unknown metadata'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000083","email":"cache-outsider@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000083',
  true
);

select throws_ok(
  $sql$
    select *
    from public.get_bowl_filter_metadata(
      '10000000-0000-4000-8000-000000000081',
      'US'
    )
  $sql$,
  '42501',
  'You do not have access to this bowl metadata.',
  'a non-member cannot read another bowl metadata snapshot'
);

reset role;
set local role service_role;

create temporary table claimed_cache_refresh on commit drop as
select *
from public.claim_tmdb_filter_metadata_refreshes(
  1,
  'US',
  now() - interval '1 day',
  null,
  null,
  null
);

select is(
  (select count(*)::integer from claimed_cache_refresh),
  1,
  'the worker claims a missing active title'
);

select ok(
  (select refresh_token is not null from claimed_cache_refresh),
  'a refresh claim receives a lease token'
);

select is(
  public.complete_tmdb_filter_metadata_refresh(
    8101,
    'US',
    (select refresh_token from claimed_cache_refresh),
    'PG-13',
    array['Netflix', 'Tubi'],
    now()
  ),
  true,
  'the matching lease can complete a refresh'
);

select is(
  (select certification from public.tmdb_filter_metadata where tmdb_id = 8101),
  'PG-13',
  'a completed refresh stores the normalized certification'
);

select is(
  (select providers from public.tmdb_filter_metadata where tmdb_id = 8101),
  array['Netflix', 'Tubi']::text[],
  'a completed refresh stores normalized providers'
);

create temporary table claimed_failed_refresh on commit drop as
select *
from public.claim_tmdb_filter_metadata_refreshes(
  1,
  'US',
  now() + interval '1 minute',
  8101,
  null,
  null
);

select is(
  (select count(*)::integer from claimed_failed_refresh),
  1,
  'a stale successful snapshot can be claimed again'
);

select is(
  public.fail_tmdb_filter_metadata_refresh(
    8101,
    'US',
    (select refresh_token from claimed_failed_refresh),
    'upstream unavailable'
  ),
  true,
  'the matching lease can record a refresh failure'
);

select is(
  (select certification from public.tmdb_filter_metadata where tmdb_id = 8101),
  'PG-13',
  'a refresh failure retains the last good certification'
);

select is(
  (select consecutive_failures from public.tmdb_filter_metadata where tmdb_id = 8101),
  1,
  'a refresh failure increments its retry counter'
);

select ok(
  (select retry_after > now() from public.tmdb_filter_metadata where tmdb_id = 8101),
  'a refresh failure receives progressive backoff'
);

reset role;

delete from public.bowl_movies
where id = '20000000-0000-4000-8000-000000000081';

select is(
  (select count(*)::integer from public.tmdb_filter_metadata where tmdb_id = 8101),
  0,
  'metadata is pruned when its final active bowl reference is removed'
);

select * from finish();

rollback;

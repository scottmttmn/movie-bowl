begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

select has_column(
  'public',
  'tmdb_filter_metadata',
  'provider_availability',
  'the metadata cache stores structured provider availability'
);

select has_column(
  'public',
  'tmdb_filter_metadata',
  'provider_watch_url',
  'the metadata cache stores the regional watch URL'
);

select col_type_is(
  'public',
  'tmdb_filter_metadata',
  'provider_availability',
  'jsonb',
  'structured provider availability uses jsonb'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_tmdb_filter_metadata_refresh(bigint,text,uuid,text,text[],timestamp with time zone,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot complete refresh work'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.complete_tmdb_filter_metadata_refresh(bigint,text,uuid,text,text[],timestamp with time zone,jsonb,text)',
    'EXECUTE'
  ),
  'the service role can complete structured refresh work'
);

insert into public.tmdb_filter_metadata (
  tmdb_id,
  region,
  refresh_started_at,
  refresh_token
)
values (
  991701,
  'US',
  now(),
  '99170100-0000-4000-8000-000000000001'
);

set local role service_role;

select is(
  public.complete_tmdb_filter_metadata_refresh(
    991701,
    'US',
    '99170100-0000-4000-8000-000000000001',
    'PG',
    array['Netflix', 'Kanopy', 'Tubi'],
    '2026-09-17T02:30:00Z',
    '{
      "subscription": [{"id": 8, "name": "Netflix"}],
      "free": [{"id": 9, "name": "Kanopy"}],
      "ads": [{"id": 10, "name": "Tubi"}],
      "rent": [{"id": 2, "name": "Apple TV"}],
      "buy": []
    }'::jsonb,
    'https://www.themoviedb.org/movie/991701/watch'
  ),
  true,
  'a matching lease stores structured provider metadata'
);

select is(
  (select providers from public.tmdb_filter_metadata where tmdb_id = 991701),
  array['Netflix', 'Kanopy', 'Tubi']::text[],
  'the eligible flattened provider list remains available for filtering'
);

select is(
  (
    select provider_availability #>> '{rent,0,name}'
    from public.tmdb_filter_metadata
    where tmdb_id = 991701
  ),
  'Apple TV',
  'transactional providers retain their original storefront identity'
);

select is(
  (
    select provider_watch_url
    from public.tmdb_filter_metadata
    where tmdb_id = 991701
  ),
  'https://www.themoviedb.org/movie/991701/watch',
  'the regional watch URL is retained'
);

reset role;

select throws_ok(
  $sql$
    update public.tmdb_filter_metadata
    set provider_availability = '[]'::jsonb
    where tmdb_id = 991701
  $sql$,
  '23514',
  null,
  'the cache rejects non-object availability payloads'
);

select * from finish();

rollback;

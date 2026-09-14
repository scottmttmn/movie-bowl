begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.service_usage_counters'::regclass),
  'usage counters have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.service_usage_counters', 'SELECT')
    and not has_table_privilege('anon', 'public.service_usage_counters', 'INSERT')
    and not has_table_privilege('anon', 'public.service_usage_counters', 'UPDATE')
    and not has_table_privilege('anon', 'public.service_usage_counters', 'DELETE'),
  'anonymous clients cannot access usage counters directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.service_usage_counters', 'SELECT')
    and not has_table_privilege('authenticated', 'public.service_usage_counters', 'INSERT')
    and not has_table_privilege('authenticated', 'public.service_usage_counters', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.service_usage_counters', 'DELETE'),
  'authenticated clients cannot access usage counters directly'
);

select ok(
  not has_table_privilege('service_role', 'public.service_usage_counters', 'SELECT')
    and not has_table_privilege('service_role', 'public.service_usage_counters', 'INSERT')
    and not has_table_privilege('service_role', 'public.service_usage_counters', 'UPDATE')
    and not has_table_privilege('service_role', 'public.service_usage_counters', 'DELETE'),
  'the service role uses only the narrow recording function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.record_service_usage(text,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.record_service_usage(text,integer)',
    'EXECUTE'
  ),
  'clients cannot execute the recording function'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_service_usage(text,integer)',
    'EXECUTE'
  ),
  'the service role can execute the recording function'
);

-- A first spend creates today's row.
select is(
  public.record_service_usage('tmdb_request'),
  1::bigint,
  'the first recorded spend returns a count of one'
);

select is(
  (
    select event_count
    from public.service_usage_counters
    where usage_date = (now() at time zone 'UTC')::date
      and metric = 'tmdb_request'
  ),
  1::bigint,
  'the first recorded spend lands on today, UTC'
);

-- Later spends accumulate onto the same day rather than replacing it.
select is(
  public.record_service_usage('tmdb_request', 4),
  5::bigint,
  'a batched spend adds to the running count'
);

-- Metrics are counted separately.
select is(
  public.record_service_usage('invite_email', 3),
  3::bigint,
  'a different metric starts its own count'
);

select is(
  (select count(*) from public.service_usage_counters),
  2::bigint,
  'each metric holds its own row for the day'
);

-- A meter must never refuse, but it must not invent spend either.
select is(
  public.record_service_usage('tmdb_request', 0),
  null::bigint,
  'recording zero spend changes nothing'
);

select is(
  (
    select event_count
    from public.service_usage_counters
    where usage_date = (now() at time zone 'UTC')::date
      and metric = 'tmdb_request'
  ),
  5::bigint,
  'a zero spend leaves the running count untouched'
);

-- An unknown metric is a typo, and a typo that silently records would read as
-- zero usage forever on the metric it was meant to be.
select throws_ok(
  $$select public.record_service_usage('not_a_metric')$$,
  '23514',
  null,
  'an unknown metric is rejected rather than silently recorded'
);

select * from finish();

rollback;

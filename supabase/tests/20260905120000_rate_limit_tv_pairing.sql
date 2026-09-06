begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

select has_table(
  'public',
  'tv_pairing_rate_limits',
  'TV pairing rate-limit counters exist'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tv_pairing_rate_limits'::regclass),
  'TV pairing rate-limit counters have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.tv_pairing_rate_limits', 'SELECT')
    and not has_table_privilege('anon', 'public.tv_pairing_rate_limits', 'INSERT')
    and not has_table_privilege('anon', 'public.tv_pairing_rate_limits', 'UPDATE')
    and not has_table_privilege('anon', 'public.tv_pairing_rate_limits', 'DELETE'),
  'anonymous clients cannot access rate-limit counters directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.tv_pairing_rate_limits', 'SELECT')
    and not has_table_privilege('authenticated', 'public.tv_pairing_rate_limits', 'INSERT')
    and not has_table_privilege('authenticated', 'public.tv_pairing_rate_limits', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.tv_pairing_rate_limits', 'DELETE'),
  'authenticated clients cannot access rate-limit counters directly'
);

select ok(
  not has_table_privilege('service_role', 'public.tv_pairing_rate_limits', 'SELECT')
    and not has_table_privilege('service_role', 'public.tv_pairing_rate_limits', 'INSERT')
    and not has_table_privilege('service_role', 'public.tv_pairing_rate_limits', 'UPDATE')
    and not has_table_privilege('service_role', 'public.tv_pairing_rate_limits', 'DELETE'),
  'the service role uses only the narrow rate-limit function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_tv_pairing_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.consume_tv_pairing_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'clients cannot execute the rate-limit function'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.consume_tv_pairing_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ),
  'the service role can consume a rate-limit attempt'
);

select is(
  public.consume_tv_pairing_rate_limit('start_ip', repeat('a', 64), 1, 600)->>'allowed',
  'true',
  'the first attempt in a window is allowed'
);

select is(
  public.consume_tv_pairing_rate_limit('start_ip', repeat('a', 64), 1, 600)->>'allowed',
  'false',
  'an attempt beyond the limit is refused'
);

select is(
  (select attempts from public.tv_pairing_rate_limits
   where bucket = 'start_ip' and subject_hash = repeat('a', 64)),
  2,
  'refused attempts are still counted'
);

update public.tv_pairing_rate_limits
set window_started_at = now() - interval '11 minutes'
where bucket = 'start_ip' and subject_hash = repeat('a', 64);

select is(
  public.consume_tv_pairing_rate_limit('start_ip', repeat('a', 64), 1, 600)->>'allowed',
  'true',
  'an expired fixed window resets on the next attempt'
);

select is(
  (select attempts from public.tv_pairing_rate_limits
   where bucket = 'start_ip' and subject_hash = repeat('a', 64)),
  1,
  'a reset window starts again at one attempt'
);

insert into public.tv_pairing_rate_limits (
  bucket,
  subject_hash,
  window_started_at,
  attempts,
  updated_at
) values (
  'stale_ip',
  repeat('b', 64),
  now() - interval '3 days',
  1,
  now() - interval '3 days'
);

select public.consume_tv_pairing_rate_limit('approve_user', repeat('c', 64), 2, 600);

select is(
  (select count(*)::integer from public.tv_pairing_rate_limits where bucket = 'stale_ip'),
  0,
  'a consume prunes stale counters'
);

select throws_ok(
  $$select public.consume_tv_pairing_rate_limit('BAD BUCKET', repeat('d', 64), 1, 600)$$,
  '22023',
  'Invalid TV pairing rate limit parameters',
  'invalid rate-limit parameters are rejected'
);

set local role authenticated;

select throws_ok(
  $$select public.consume_tv_pairing_rate_limit('start_ip', repeat('e', 64), 1, 600)$$,
  '42501',
  'permission denied for function consume_tv_pairing_rate_limit',
  'authenticated clients cannot call the service-only function'
);

reset role;
select * from finish();

rollback;

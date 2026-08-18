begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tv_pairing_requests'::regclass),
  'TV pairing requests have row level security enabled'
);

select ok(
  not has_table_privilege('anon', 'public.tv_pairing_requests', 'SELECT')
    and not has_table_privilege('anon', 'public.tv_pairing_requests', 'INSERT')
    and not has_table_privilege('anon', 'public.tv_pairing_requests', 'UPDATE'),
  'anonymous clients cannot access TV pairing requests directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.tv_pairing_requests', 'SELECT')
    and not has_table_privilege('authenticated', 'public.tv_pairing_requests', 'INSERT')
    and not has_table_privilege('authenticated', 'public.tv_pairing_requests', 'UPDATE'),
  'authenticated clients cannot access TV pairing requests directly'
);

select ok(
  has_table_privilege('service_role', 'public.tv_pairing_requests', 'SELECT')
    and has_table_privilege('service_role', 'public.tv_pairing_requests', 'INSERT')
    and has_table_privilege('service_role', 'public.tv_pairing_requests', 'UPDATE')
    and has_table_privilege('service_role', 'public.tv_pairing_requests', 'DELETE'),
  'only the server service role has the required pairing-table privileges'
);

select lives_ok(
  $sql$
    insert into public.tv_pairing_requests (
      id,
      user_code,
      device_secret_hash,
      expires_at
    ) values (
      '40000000-0000-4000-8000-000000000001',
      'ABCD2345',
      repeat('a', 64),
      now() + interval '10 minutes'
    )
  $sql$,
  'a valid short-lived pairing request can be stored by the server'
);

select throws_ok(
  $sql$
    insert into public.tv_pairing_requests (
      id,
      user_code,
      device_secret_hash,
      expires_at
    ) values (
      '40000000-0000-4000-8000-000000000002',
      'BAD-CODE',
      repeat('b', 64),
      now() + interval '10 minutes'
    )
  $sql$,
  '23514',
  null,
  'formatted or ambiguous user codes are rejected at the database boundary'
);

select throws_ok(
  $sql$
    insert into public.tv_pairing_requests (
      id,
      user_code,
      device_secret_hash,
      expires_at
    ) values (
      '40000000-0000-4000-8000-000000000003',
      'WXYZ6789',
      repeat('c', 64),
      now() + interval '1 hour'
    )
  $sql$,
  '23514',
  null,
  'pairing requests cannot be created with a long-lived expiration'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000311', 'create-owner@example.com'),
  ('00000000-0000-0000-0000-000000000312', 'create-other@example.com'),
  ('00000000-0000-0000-0000-000000000313', 'create-full@example.com'),
  ('00000000-0000-0000-0000-000000000314', 'create-fails@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-00000000031_';

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

select ok(
  has_function_privilege('authenticated', 'public.create_owned_bowl(uuid, text)', 'execute'),
  'signed-in callers can create a bowl'
);

select ok(
  not has_function_privilege('anon', 'public.create_owned_bowl(uuid, text)', 'execute'),
  'anonymous callers cannot create a bowl'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.create_owned_bowl(uuid, text)'::regprocedure),
  false,
  'bowl creation runs as the caller, under the ordinary bowl policies'
);

-- A first creation.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000311');

select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000311', '  Friday Films  ')).name,
  'Friday Films',
  'creating returns the new bowl with its trimmed name'
);
reset role;

select is(
  (select owner_id from public.bowls where id = '10000000-0000-0000-0000-000000000311'),
  '00000000-0000-0000-0000-000000000311'::uuid,
  'the bowl belongs to the caller'
);

select is(
  (select role from public.bowl_members
   where bowl_id = '10000000-0000-0000-0000-000000000311'
     and user_id = '00000000-0000-0000-0000-000000000311'),
  'Owner',
  'the owner membership lands in the same call'
);

-- A retry after a lost response, even with an edited name.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000311');
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000311', 'Saturday Films')).name,
  'Friday Films',
  'repeating the same bowl id returns the bowl that already exists'
);
reset role;

select is(
  (select count(*)::int from public.bowls where owner_id = '00000000-0000-0000-0000-000000000311'),
  1,
  'a repeat does not create a second bowl'
);

select is(
  (select count(*)::int from public.bowl_members where bowl_id = '10000000-0000-0000-0000-000000000311'),
  1,
  'a repeat does not duplicate the owner membership'
);

-- The partial state the old two-write path could leave: a bowl, no membership.
insert into public.bowls (id, owner_id, name)
values ('10000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000311', 'Half Made');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000311');
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000312', 'Half Made')).id,
  '10000000-0000-0000-0000-000000000312'::uuid,
  'retrying a half-made bowl returns it'
);
reset role;

select is(
  (select role from public.bowl_members
   where bowl_id = '10000000-0000-0000-0000-000000000312'
     and user_id = '00000000-0000-0000-0000-000000000311'),
  'Owner',
  'retrying repairs the missing owner membership'
);

-- Someone else's bowl id.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000312');
select throws_ok(
  $sql$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000311', 'Mine Now') $sql$,
  'P0001',
  'This bowl could not be created. Please try again.',
  'a bowl id that belongs to someone else is refused'
);
reset role;

select is(
  (select count(*)::int from public.bowl_members
   where bowl_id = '10000000-0000-0000-0000-000000000311'
     and user_id = '00000000-0000-0000-0000-000000000312'),
  0,
  'the refusal adds no membership to someone else''s bowl'
);

select is(
  (select name from public.bowls where id = '10000000-0000-0000-0000-000000000311'),
  'Friday Films',
  'the refusal leaves someone else''s bowl unchanged'
);

-- Input and identity checks.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000312');
select throws_ok(
  $sql$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000313', '   ') $sql$,
  '22023',
  'Bowl name is required.',
  'a blank name is refused'
);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $sql$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000313', 'Nobody') $sql$,
  '42501',
  'You must be signed in to create a bowl.',
  'an unidentified caller is refused'
);
reset role;

-- The ten-bowl limit.
insert into public.bowls (id, owner_id, name)
select ('10000000-0000-0000-0000-0000000004' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000313',
       'Full ' || n
from generate_series(1, 9) as n;

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000313');
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000410', 'Tenth')).name,
  'Tenth',
  'a tenth bowl is allowed'
);
select throws_ok(
  $sql$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000411', 'Eleventh') $sql$,
  'P0001',
  'You can create up to 10 bowls.',
  'an eleventh bowl is refused'
);
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000410', 'Tenth')).name,
  'Tenth',
  'retrying a bowl that already counts toward the limit still succeeds'
);
reset role;

select is(
  (select count(*)::int from public.bowls where owner_id = '00000000-0000-0000-0000-000000000313'),
  10,
  'the limit holds at ten bowls'
);

-- All or nothing: a membership failure takes the bowl with it.
create function pg_temp.refuse_membership() returns trigger
language plpgsql as $$
begin
  if new.user_id = '00000000-0000-0000-0000-000000000314' then
    raise exception 'membership write failed';
  end if;
  return new;
end;
$$;
create trigger refuse_membership_for_test
before insert on public.bowl_members
for each row execute function pg_temp.refuse_membership();

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000314');
select throws_ok(
  $sql$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000314', 'Doomed') $sql$,
  'P0001',
  'membership write failed',
  'a failed owner membership fails the whole creation'
);
reset role;

select is(
  (select count(*)::int from public.bowls where id = '10000000-0000-0000-0000-000000000314'),
  0,
  'no bowl is left behind without its owner membership'
);

select * from finish();

rollback;

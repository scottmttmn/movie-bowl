begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000031', 'method-owner@example.com'),
  ('00000000-0000-0000-0000-000000000032', 'method-member@example.com'),
  ('00000000-0000-0000-0000-000000000033', 'method-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000032',
  '00000000-0000-0000-0000-000000000033'
);

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-0000-0000-000000000031',
  'Draw Method Bowl',
  '00000000-0000-0000-0000-000000000031'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000031',
    'Owner'
  ),
  (
    '10000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000032',
    'Member'
  );

select is(
  (
    select draw_method
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000031'
  ),
  'person_first',
  'a bowl created without a draw method defaults to person-first'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_bowl_draw_method(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can call the draw method function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.save_bowl_draw_method(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot call the draw method function'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.save_bowl_draw_method(uuid,text)'::regprocedure
  ),
  true,
  'the draw method function is security definer'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.save_bowl_draw_method(uuid,text)'::regprocedure
  ),
  array['search_path=public']::text[],
  'the draw method function fixes its search path'
);

-- A member of the bowl is still not the owner.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000032","email":"method-member@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000031',
      'title_first'
    )
  $sql$,
  '42501',
  'Only the bowl owner can update the draw method.',
  'a member cannot change the draw method'
);

reset role;

select is(
  (
    select draw_method
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000031'
  ),
  'person_first',
  'a member attempt leaves the draw method unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000033","email":"method-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000031',
      'title_first'
    )
  $sql$,
  '42501',
  'Only the bowl owner can update the draw method.',
  'a non-member cannot change the draw method'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000031","email":"method-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000031',
      'rotation'
    )
  $sql$,
  'P0001',
  'Invalid draw method.',
  'the owner cannot save a method that is not implemented yet'
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000031',
      null
    )
  $sql$,
  'P0001',
  'Invalid draw method.',
  'the owner cannot save a missing method'
);

reset role;

select is(
  (
    select draw_method
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000031'
  ),
  'person_first',
  'an invalid method leaves the draw method unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000031","email":"method-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.save_bowl_draw_method(
    '10000000-0000-0000-0000-000000000031',
    'title_first'
  ),
  'title_first',
  'the owner can switch the bowl to title-first'
);

select is(
  public.save_bowl_draw_method(
    '10000000-0000-0000-0000-000000000031',
    'person_first'
  ),
  'person_first',
  'the owner can switch the bowl back to person-first'
);

reset role;

select throws_ok(
  $sql$
    update public.bowls
    set draw_method = 'raffle'
    where id = '10000000-0000-0000-0000-000000000031'
  $sql$,
  '23514',
  null,
  'the check constraint rejects an unknown draw method'
);

select * from finish();

rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'access-owner@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'access-member-one@example.com'),
  ('00000000-0000-0000-0000-000000000023', 'access-member-two@example.com'),
  ('00000000-0000-0000-0000-000000000024', 'access-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000024'
);

insert into public.bowls (id, name, owner_id, draw_access_mode)
values (
  '10000000-0000-0000-0000-000000000021',
  'Atomic Draw Access Bowl',
  '00000000-0000-0000-0000-000000000021',
  'all_members'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000021',
    'Owner'
  ),
  (
    '10000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000022',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000023',
    'Member'
  );

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_bowl_draw_access(uuid,text,uuid[])',
    'EXECUTE'
  ),
  'authenticated users can call the atomic draw access function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.save_bowl_draw_access(uuid,text,uuid[])',
    'EXECUTE'
  ),
  'anonymous users cannot call the atomic draw access function'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.save_bowl_draw_access(uuid,text,uuid[])'::regprocedure
  ),
  true,
  'the atomic draw access function is security definer'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.save_bowl_draw_access(uuid,text,uuid[])'::regprocedure
  ),
  array['search_path=public']::text[],
  'the atomic draw access function fixes its search path'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","email":"access-member-one@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      'selected_members',
      array['00000000-0000-0000-0000-000000000022'::uuid]
    )
  $sql$,
  '42501',
  'Only the bowl owner can update draw access.',
  'a non-owner cannot change draw access'
);

reset role;

select is(
  (
    select draw_access_mode
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'all_members',
  'an unauthorized attempt leaves the mode unchanged'
);

select is(
  (
    select count(*)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  0::bigint,
  'an unauthorized attempt leaves permissions unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      'some_members',
      '{}'::uuid[]
    )
  $sql$,
  'P0001',
  'Invalid draw access mode.',
  'the owner cannot save an invalid mode'
);

reset role;

select ok(
  (
    select draw_access_mode = 'all_members'
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  )
  and not exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  'an invalid mode leaves all draw access settings unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      null,
      '{}'::uuid[]
    )
  $sql$,
  'P0001',
  'Invalid draw access mode.',
  'the owner cannot save a missing mode'
);

reset role;

select ok(
  (
    select draw_access_mode = 'all_members'
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  )
  and not exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  'a missing mode leaves all draw access settings unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      'selected_members',
      array['00000000-0000-0000-0000-000000000024'::uuid]
    )
  $sql$,
  'P0001',
  'Draw access can only be granted to current bowl members.',
  'the owner cannot grant access to an outsider'
);

reset role;

select ok(
  (
    select draw_access_mode = 'all_members'
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  )
  and not exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  'an outsider selection leaves all draw access settings unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      'selected_members',
      array['00000000-0000-0000-0000-000000000021'::uuid]
    )
  $sql$,
  'P0001',
  'Draw access can only be granted to current bowl members.',
  'the owner is not redundantly stored as a selected member'
);

reset role;

select ok(
  (
    select draw_access_mode = 'all_members'
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  )
  and not exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  'an owner selection leaves all draw access settings unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.save_bowl_draw_access(
    '10000000-0000-0000-0000-000000000021',
    'selected_members',
    array[
      '00000000-0000-0000-0000-000000000022'::uuid,
      '00000000-0000-0000-0000-000000000022'::uuid,
      '00000000-0000-0000-0000-000000000023'::uuid
    ]
  ),
  'selected_members',
  'the owner can atomically select current members'
);

reset role;

select is(
  (
    select draw_access_mode
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'selected_members',
  'the selected-member mode is saved'
);

select is(
  (
    select count(*)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  2::bigint,
  'duplicate selected members are stored once'
);

select is(
  (
    select array_agg(user_id order by user_id)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  array[
    '00000000-0000-0000-0000-000000000022'::uuid,
    '00000000-0000-0000-0000-000000000023'::uuid
  ],
  'the complete selected-member list is saved'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","email":"access-member-one@example.com","role":"authenticated"}',
  true
);

select ok(
  public.can_draw_from_bowl('10000000-0000-0000-0000-000000000021'),
  'a selected member can draw'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000024","email":"access-outsider@example.com","role":"authenticated"}',
  true
);

select ok(
  not public.can_draw_from_bowl('10000000-0000-0000-0000-000000000021'),
  'an outsider cannot draw'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.save_bowl_draw_access(
    '10000000-0000-0000-0000-000000000021',
    'selected_members',
    array['00000000-0000-0000-0000-000000000023'::uuid]
  ),
  'selected_members',
  'the owner can atomically replace the selected-member list'
);

reset role;

select is(
  (
    select array_agg(user_id order by user_id)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  array['00000000-0000-0000-0000-000000000023'::uuid],
  'replacing the list removes prior permissions'
);

create function public.test_reject_draw_permission_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'simulated permission delete failure'
    using errcode = 'P0001';
end;
$$;

create trigger test_reject_draw_permission_delete
before delete on public.bowl_draw_permissions
for each statement
execute function public.test_reject_draw_permission_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_access(
      '10000000-0000-0000-0000-000000000021',
      'all_members',
      '{}'::uuid[]
    )
  $sql$,
  'P0001',
  'simulated permission delete failure',
  'a permission failure aborts the complete save'
);

reset role;

select is(
  (
    select draw_access_mode
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'selected_members',
  'a permission failure rolls back the mode update'
);

select is(
  (
    select array_agg(user_id order by user_id)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  array['00000000-0000-0000-0000-000000000023'::uuid],
  'a permission failure preserves the prior permission list'
);

drop trigger test_reject_draw_permission_delete
on public.bowl_draw_permissions;

drop function public.test_reject_draw_permission_delete();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000021","email":"access-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.save_bowl_draw_access(
    '10000000-0000-0000-0000-000000000021',
    'all_members',
    array['00000000-0000-0000-0000-000000000024'::uuid]
  ),
  'all_members',
  'the owner can atomically restore access for all members'
);

reset role;

select is(
  (
    select draw_access_mode
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000021'
  ),
  'all_members',
  'the all-members mode is saved'
);

select is(
  (
    select count(*)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000021'
  ),
  0::bigint,
  'all-members mode clears the selected-member list'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000022","email":"access-member-one@example.com","role":"authenticated"}',
  true
);

select ok(
  public.can_draw_from_bowl('10000000-0000-0000-0000-000000000021'),
  'every current member can draw in all-members mode'
);

reset role;

select * from finish();

rollback;

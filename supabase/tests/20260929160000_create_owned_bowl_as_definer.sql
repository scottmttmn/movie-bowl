begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(4);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000951', 'strict-policy@example.com');

insert into public.profiles (id, email)
values ('00000000-0000-0000-0000-000000000951', 'strict-policy@example.com');

-- A bowl the caller owns but has no membership in: the half-made shape.
insert into public.bowls (id, name, owner_id)
values ('10000000-0000-0000-0000-000000000952', 'Half Made', '00000000-0000-0000-0000-000000000951');

-- Production's bowl_members insert policy refuses the Owner row that the
-- baseline's allows. Take every insert policy away, so the table refuses any
-- insert a caller makes directly: creation must not depend on one.
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bowl_members' and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy %I on public.bowl_members', v_policy.policyname);
  end loop;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000951","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.bowl_members (bowl_id, user_id, role)
     values ('10000000-0000-0000-0000-000000000952', '00000000-0000-0000-0000-000000000951', 'Owner') $$,
  '42501',
  null,
  'the caller cannot write a membership row directly'
);

select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000951', 'Strict')).id,
  '10000000-0000-0000-0000-000000000951'::uuid,
  'creating a bowl still succeeds'
);

reset role;

select is(
  (
    select role from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000951'
      and user_id = '00000000-0000-0000-0000-000000000951'
  ),
  'Owner',
  'and the caller is its Owner'
);
select is(
  (select owner_id from public.bowls where id = '10000000-0000-0000-0000-000000000951'),
  '00000000-0000-0000-0000-000000000951'::uuid,
  'and owns it'
);

select * from finish();

rollback;

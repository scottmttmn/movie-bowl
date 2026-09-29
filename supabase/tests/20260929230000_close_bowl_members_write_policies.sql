begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'roster-owner@example.com'),
  ('00000000-0000-0000-0000-000000000a02', 'roster-invitee@example.com'),
  ('00000000-0000-0000-0000-000000000a03', 'roster-member@example.com');

insert into public.profiles (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'roster-owner@example.com'),
  ('00000000-0000-0000-0000-000000000a02', 'roster-invitee@example.com'),
  ('00000000-0000-0000-0000-000000000a03', 'roster-member@example.com');

insert into public.bowls (id, name, owner_id)
values ('10000000-0000-0000-0000-000000000a01', 'Roster', '00000000-0000-0000-0000-000000000a01');

insert into public.bowl_members (bowl_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a01', 'Owner'),
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a03', 'Member');

insert into public.bowl_invites (bowl_id, invited_email, invited_by, token)
values (
  '10000000-0000-0000-0000-000000000a01',
  'roster-invitee@example.com',
  '00000000-0000-0000-0000-000000000a01',
  'roster-invite-token'
);

select is(
  (
    select count(*)::integer from pg_policies
    where schemaname = 'public'
      and tablename = 'bowl_members'
      and cmd in ('INSERT', 'UPDATE', 'ALL')
      and policyname <> 'bowl_members_bootstrap_owner_row'
  ),
  0,
  'the only direct insert left on bowl_members is an owner''s own Owner row'
);
select hasnt_function('public', 'is_bowl_owner_member', array['uuid'], 'the role-based owner check is gone');

set local role authenticated;

-- The invitee, before accepting.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","role":"authenticated","email":"roster-invitee@example.com"}', true);

select throws_ok(
  $$ insert into public.bowl_members (bowl_id, user_id, role)
     values ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02', 'Member') $$,
  '42501',
  null,
  'a pending invitee cannot write their own membership row'
);
select throws_ok(
  $$ insert into public.bowl_members (bowl_id, user_id, role)
     values ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02', 'Owner') $$,
  '42501',
  null,
  'nor one naming them Owner'
);

select is(
  public.accept_bowl_invite('roster-invite-token'),
  '10000000-0000-0000-0000-000000000a01'::uuid,
  'accepting the invitation still admits them'
);

update public.bowl_members set role = 'Owner'
where bowl_id = '10000000-0000-0000-0000-000000000a01'
  and user_id = '00000000-0000-0000-0000-000000000a02';

select isnt(
  (
    select role from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000a01'
      and user_id = '00000000-0000-0000-0000-000000000a02'
  ),
  'Owner',
  'a member cannot promote themselves'
);

delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000a01'
  and user_id = '00000000-0000-0000-0000-000000000a03';

-- The member, leaving.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a03","role":"authenticated","email":"roster-member@example.com"}', true);

select is(
  (select count(*)::integer from public.bowl_members where bowl_id = '10000000-0000-0000-0000-000000000a01'),
  3,
  'a member cannot remove another member'
);

delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000a01'
  and user_id = '00000000-0000-0000-0000-000000000a03';

-- The owner, managing the roster.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","role":"authenticated","email":"roster-owner@example.com"}', true);

delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000a01'
  and user_id = '00000000-0000-0000-0000-000000000a02';

delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000a01'
  and user_id = '00000000-0000-0000-0000-000000000a01';

reset role;

select is(
  (
    select role from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000a01'
      and user_id = '00000000-0000-0000-0000-000000000a02'
  ),
  null,
  'the owner can remove a member'
);
select ok(
  not exists (
    select 1 from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000a01'
      and user_id = '00000000-0000-0000-0000-000000000a03'
  ),
  'a member can leave'
);
select is(
  (
    select role from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000a01'
      and user_id = '00000000-0000-0000-0000-000000000a01'
  ),
  'Owner',
  'the owner''s own row survives a direct delete'
);

-- An invitee who was admitted and then removed does not get back in by
-- inserting directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","role":"authenticated","email":"roster-invitee@example.com"}', true);
select throws_ok(
  $$ insert into public.bowl_members (bowl_id, user_id, role)
     values ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02', 'Member') $$,
  '42501',
  null,
  'a removed member cannot re-insert themselves'
);
reset role;

select is(
  (select owner_id from public.bowls where id = '10000000-0000-0000-0000-000000000a01'),
  '00000000-0000-0000-0000-000000000a01'::uuid,
  'and the bowl still belongs to its owner'
);

select * from finish();

rollback;

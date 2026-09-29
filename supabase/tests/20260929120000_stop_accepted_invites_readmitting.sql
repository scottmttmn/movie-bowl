begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(16);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000291', 'readmit-owner@example.com'),
  ('00000000-0000-0000-0000-000000000292', 'readmit-removed@example.com'),
  ('00000000-0000-0000-0000-000000000293', 'readmit-leaver@example.com'),
  ('00000000-0000-0000-0000-000000000294', 'readmit-stays@example.com'),
  ('00000000-0000-0000-0000-000000000295', 'readmit-partial@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-00000000029_';

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-0000-0000-000000000291',
  'Readmit Bowl',
  '00000000-0000-0000-0000-000000000291'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000291', '00000000-0000-0000-0000-000000000291', 'Owner'),
  -- Old two-write partial state: member, invite never marked accepted.
  ('10000000-0000-0000-0000-000000000291', '00000000-0000-0000-0000-000000000295', 'Member');

insert into public.bowl_invites (id, bowl_id, invited_email, invited_by, token)
values
  ('30000000-0000-0000-0000-000000000291', '10000000-0000-0000-0000-000000000291',
   'readmit-removed@example.com', '00000000-0000-0000-0000-000000000291', 'token-readmit-removed'),
  ('30000000-0000-0000-0000-000000000292', '10000000-0000-0000-0000-000000000291',
   'readmit-leaver@example.com', '00000000-0000-0000-0000-000000000291', 'token-readmit-leaver'),
  ('30000000-0000-0000-0000-000000000293', '10000000-0000-0000-0000-000000000291',
   'readmit-stays@example.com', '00000000-0000-0000-0000-000000000291', 'token-readmit-stays'),
  ('30000000-0000-0000-0000-000000000294', '10000000-0000-0000-0000-000000000291',
   'readmit-partial@example.com', '00000000-0000-0000-0000-000000000291', 'token-readmit-partial');

create function pg_temp.act_as(p_user uuid, p_email text) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'email', p_email, 'role', 'authenticated')::text,
    true
  );
$$;

create function pg_temp.is_member(p_user uuid) returns boolean
language sql as $$
  select exists (
    select 1 from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000291' and user_id = p_user
  );
$$;

-- Three people accept their invites.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000292', 'readmit-removed@example.com');
select is(public.accept_bowl_invite('token-readmit-removed'),
  '10000000-0000-0000-0000-000000000291'::uuid, 'a pending invite admits its account');
select pg_temp.act_as('00000000-0000-0000-0000-000000000293', 'readmit-leaver@example.com');
select is(public.accept_bowl_invite('token-readmit-leaver'),
  '10000000-0000-0000-0000-000000000291'::uuid, 'a second pending invite admits its account');
select pg_temp.act_as('00000000-0000-0000-0000-000000000294', 'readmit-stays@example.com');
select is(public.accept_bowl_invite('token-readmit-stays'),
  '10000000-0000-0000-0000-000000000291'::uuid, 'a third pending invite admits its account');

-- A repeat while still a member is a harmless success.
select is(public.accept_bowl_invite('token-readmit-stays'),
  '10000000-0000-0000-0000-000000000291'::uuid,
  'repeating an accepted invite succeeds while the membership exists');
reset role;

select ok(pg_temp.is_member('00000000-0000-0000-0000-000000000294'),
  'the repeat leaves the membership in place');

-- The owner removes one member, through the same client write Bowl Settings uses.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000291', 'readmit-owner@example.com');
delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000291'
  and user_id = '00000000-0000-0000-0000-000000000292';
reset role;

select ok(not pg_temp.is_member('00000000-0000-0000-0000-000000000292'),
  'the owner can remove a member');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000292', 'readmit-removed@example.com');
select throws_ok(
  $sql$ select public.accept_bowl_invite('token-readmit-removed') $sql$,
  'P0001',
  'This invite is no longer available. It may have been used already, or it was sent to a different account.',
  'a removed member cannot rejoin by replaying their accepted invite'
);
reset role;

select ok(not pg_temp.is_member('00000000-0000-0000-0000-000000000292'),
  'the refused replay does not recreate the membership');

-- Another member leaves on their own.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000293', 'readmit-leaver@example.com');
delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000291'
  and user_id = '00000000-0000-0000-0000-000000000293';
reset role;

select ok(not pg_temp.is_member('00000000-0000-0000-0000-000000000293'),
  'a member can leave');

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000293', 'readmit-leaver@example.com');
select throws_ok(
  $sql$ select public.accept_bowl_invite('token-readmit-leaver') $sql$,
  'P0001',
  'This invite is no longer available. It may have been used already, or it was sent to a different account.',
  'someone who left cannot rejoin by replaying their accepted invite'
);
reset role;

select ok(not pg_temp.is_member('00000000-0000-0000-0000-000000000293'),
  'leaving stays durable after a replay');

-- The old partial state still repairs: pending invite, membership present.
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000295', 'readmit-partial@example.com');
select is(public.accept_bowl_invite('token-readmit-partial'),
  '10000000-0000-0000-0000-000000000291'::uuid,
  'an existing member can still finalize a pending invite');
reset role;

select isnt(
  (select accepted_at from public.bowl_invites where id = '30000000-0000-0000-0000-000000000294'),
  null,
  'finalizing marks the pending invite accepted'
);

select is(
  (select count(*)::int from public.bowl_members
   where bowl_id = '10000000-0000-0000-0000-000000000291'
     and user_id = '00000000-0000-0000-0000-000000000295'),
  1,
  'finalizing does not duplicate the membership'
);

-- The legacy queue helper is internal. Its callers are all definers.
select ok(
  not has_function_privilege('authenticated', 'public.promote_queued_movies_for_bowl(uuid)', 'execute'),
  'signed-in callers cannot run the queue promotion helper directly'
);

select ok(
  not has_function_privilege('anon', 'public.promote_queued_movies_for_bowl(uuid)', 'execute'),
  'anonymous callers cannot run the queue promotion helper directly'
);

select * from finish();

rollback;

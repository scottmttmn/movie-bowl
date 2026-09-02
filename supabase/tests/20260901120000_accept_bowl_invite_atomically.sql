begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(19);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000061', 'invite-owner@example.com'),
  ('00000000-0000-0000-0000-000000000062', 'invite-guest@example.com'),
  ('00000000-0000-0000-0000-000000000063', 'invite-outsider@example.com'),
  ('00000000-0000-0000-0000-000000000064', 'invite-repair-one@example.com'),
  ('00000000-0000-0000-0000-000000000065', 'invite-repair-two@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000063',
  '00000000-0000-0000-0000-000000000064',
  '00000000-0000-0000-0000-000000000065'
);

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-0000-0000-000000000061',
  'Atomic Invite Bowl',
  '00000000-0000-0000-0000-000000000061'
);

insert into public.bowl_members (bowl_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000061',
  'Owner'
);

-- Mixed case on purpose: acceptance matches the address case-insensitively.
insert into public.bowl_invites (id, bowl_id, invited_email, invited_by, token)
values
  (
    '30000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000061',
    'Invite-Guest@Example.com',
    '00000000-0000-0000-0000-000000000061',
    'token-guest'
  ),
  (
    '30000000-0000-0000-0000-000000000062',
    '10000000-0000-0000-0000-000000000061',
    'invite-repair-one@example.com',
    '00000000-0000-0000-0000-000000000061',
    'token-repair-one'
  ),
  (
    '30000000-0000-0000-0000-000000000063',
    '10000000-0000-0000-0000-000000000061',
    'invite-repair-two@example.com',
    '00000000-0000-0000-0000-000000000061',
    'token-repair-two'
  );

select ok(
  has_function_privilege('authenticated', 'public.accept_bowl_invite(text)', 'execute'),
  'signed-in callers can accept an invite'
);

select ok(
  not has_function_privilege('anon', 'public.accept_bowl_invite(text)', 'execute'),
  'anonymous callers cannot accept an invite'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.accept_bowl_invite(text)'::regprocedure),
  true,
  'invite acceptance runs as a definer so it can own both writes'
);

select is(
  (select proconfig from pg_proc where oid = 'public.accept_bowl_invite(text)'::regprocedure),
  array['search_path=public']::text[],
  'the invite acceptance function fixes its search path'
);

-- A session without an email claim cannot be matched to an invite.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$ select public.accept_bowl_invite('token-guest') $sql$,
  '42501',
  'You must be signed in to accept an invite.',
  'an invite cannot be accepted without an identified account'
);

reset role;

-- Someone else's token tells the caller nothing about it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000063","email":"invite-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$ select public.accept_bowl_invite('token-guest') $sql$,
  'P0001',
  'This invite is no longer available. It may have been used already, or it was sent to a different account.',
  'an invite addressed to someone else is refused'
);

select throws_ok(
  $sql$ select public.accept_bowl_invite('token-does-not-exist') $sql$,
  'P0001',
  'This invite is no longer available. It may have been used already, or it was sent to a different account.',
  'an unknown token is refused with the same answer as a mismatch'
);

select throws_ok(
  $sql$ select public.accept_bowl_invite(null) $sql$,
  'P0001',
  'This invite is no longer available. It may have been used already, or it was sent to a different account.',
  'a missing token is refused with the same answer as a mismatch'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and user_id = '00000000-0000-0000-0000-000000000063'
  ),
  0,
  'a refused acceptance leaves no membership behind'
);

-- The invited account accepts.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","email":"invite-guest@example.com","role":"authenticated"}',
  true
);

select is(
  public.accept_bowl_invite('token-guest'),
  '10000000-0000-0000-0000-000000000061'::uuid,
  'accepting returns the bowl the invite was for'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and user_id = '00000000-0000-0000-0000-000000000062'
  ),
  1,
  'acceptance establishes membership'
);

select isnt(
  (select accepted_at from public.bowl_invites where id = '30000000-0000-0000-0000-000000000061'),
  null,
  'acceptance finalizes the invite in the same call'
);

create temporary table invite_probe as
select accepted_at
from public.bowl_invites
where id = '30000000-0000-0000-0000-000000000061';

-- Retrying the same acceptance must be harmless.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","email":"invite-guest@example.com","role":"authenticated"}',
  true
);

select is(
  public.accept_bowl_invite('token-guest'),
  '10000000-0000-0000-0000-000000000061'::uuid,
  'a repeat acceptance still returns the bowl instead of failing'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and user_id = '00000000-0000-0000-0000-000000000062'
  ),
  1,
  'a repeat acceptance does not duplicate membership'
);

select is(
  (select accepted_at from public.bowl_invites where id = '30000000-0000-0000-0000-000000000061'),
  (select accepted_at from invite_probe),
  'a repeat acceptance keeps the original acceptance time'
);

-- Partial state left by the old two-write path: membership without a
-- finalized invite.
insert into public.bowl_members (bowl_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000064',
  'Member'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000064","email":"invite-repair-one@example.com","role":"authenticated"}',
  true
);

select is(
  public.accept_bowl_invite('token-repair-one'),
  '10000000-0000-0000-0000-000000000061'::uuid,
  'an existing member can still finalize their outstanding invite'
);

reset role;

select isnt(
  (select accepted_at from public.bowl_invites where id = '30000000-0000-0000-0000-000000000062'),
  null,
  'finalizing repairs a membership that never marked its invite accepted'
);

-- The mirror image: a finalized invite whose membership never landed.
update public.bowl_invites
set accepted_at = now()
where id = '30000000-0000-0000-0000-000000000063';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000065","email":"invite-repair-two@example.com","role":"authenticated"}',
  true
);

select is(
  public.accept_bowl_invite('token-repair-two'),
  '10000000-0000-0000-0000-000000000061'::uuid,
  'an already-finalized invite still admits the account it named'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and user_id = '00000000-0000-0000-0000-000000000065'
  ),
  1,
  'finalizing repairs an invite that was marked accepted without membership'
);

select * from finish();

rollback;

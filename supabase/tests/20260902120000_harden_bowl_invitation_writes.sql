begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(63);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000071', 'batch-owner@example.com'),
  ('00000000-0000-0000-0000-000000000072', 'batch-member@example.com'),
  ('00000000-0000-0000-0000-000000000073', 'batch-outsider@example.com'),
  ('00000000-0000-0000-0000-000000000074', 'already-member@example.com'),
  ('00000000-0000-0000-0000-000000000075', 'decline@example.com'),
  ('00000000-0000-0000-0000-000000000076', 'leave@example.com'),
  ('00000000-0000-0000-0000-000000000077', 'update@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000072',
  '00000000-0000-0000-0000-000000000073',
  '00000000-0000-0000-0000-000000000074',
  '00000000-0000-0000-0000-000000000075',
  '00000000-0000-0000-0000-000000000076',
  '00000000-0000-0000-0000-000000000077'
);

insert into public.bowls (id, name, owner_id)
values
  (
    '10000000-0000-0000-0000-000000000071',
    'Invitation Batch Bowl',
    '00000000-0000-0000-0000-000000000071'
  ),
  (
    '10000000-0000-0000-0000-000000000072',
    'Second Owner Bowl',
    '00000000-0000-0000-0000-000000000071'
  );

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000071',
    'Owner'
  ),
  (
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000072',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000074',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000072',
    '00000000-0000-0000-0000-000000000071',
    'Owner'
  );

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_bowl_invites(uuid,text[],uuid)',
    'execute'
  ),
  'authenticated callers can invoke batch invitation creation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_bowl_invites(uuid,text[],uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke batch invitation creation'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.revoke_bowl_invite(uuid,uuid)',
    'execute'
  ),
  'authenticated callers can invoke guarded invitation revoke'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.revoke_bowl_invite(uuid,uuid)',
    'execute'
  ),
  'anonymous callers cannot invoke guarded invitation revoke'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.create_bowl_invites(uuid,text[],uuid)'::regprocedure
  ),
  true,
  'batch invitation creation runs as a security definer'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.revoke_bowl_invite(uuid,uuid)'::regprocedure
  ),
  true,
  'guarded invitation revoke runs as a security definer'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.create_bowl_invites(uuid,text[],uuid)'::regprocedure
  ),
  array['search_path=public']::text[],
  'batch invitation creation fixes its search path'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.revoke_bowl_invite(uuid,uuid)'::regprocedure
  ),
  array['search_path=public']::text[],
  'guarded invitation revoke fixes its search path'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'bowl_invites'
      and indexname = 'bowl_invites_one_pending_per_email_idx'
      and indexdef ilike '%where (accepted_at is null)%'
  ),
  'pending invitations have a partial normalized-email uniqueness index'
);

select ok(
  not has_table_privilege('authenticated', 'public.bowl_invite_batches', 'SELECT'),
  'authenticated callers cannot read private batch request records'
);

select ok(
  not has_table_privilege('anon', 'public.bowl_invite_batches', 'SELECT'),
  'anonymous callers cannot read private batch request records'
);

select ok(
  not has_table_privilege('authenticated', 'public.bowl_invites', 'INSERT'),
  'authenticated callers cannot insert invitations directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.bowl_invites', 'UPDATE'),
  'authenticated callers cannot update invitations directly'
);

select ok(
  has_table_privilege('authenticated', 'public.bowl_invites', 'DELETE'),
  'invitees retain the direct delete privilege required by decline and leave cleanup'
);

-- Authentication is required even though the functions own their table writes.
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000071',
      array['friend@example.com'],
      '40000000-0000-0000-0000-000000000071'
    )
  $sql$,
  '42501',
  'You must be signed in to manage bowl invitations.',
  'a batch cannot be created without an authenticated user id'
);

reset role;

-- Bowl members and unrelated callers cannot send invitations.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000072","email":"batch-member@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000071',
      array['friend@example.com'],
      '40000000-0000-0000-0000-000000000072'
    )
  $sql$,
  '42501',
  'This bowl is unavailable or you are not allowed to manage its invitations.',
  'a non-owner member cannot create invitations'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000073","email":"batch-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000071',
      array['friend@example.com'],
      '40000000-0000-0000-0000-000000000073'
    )
  $sql$,
  '42501',
  'This bowl is unavailable or you are not allowed to manage its invitations.',
  'a non-member cannot create invitations'
);

reset role;

-- The owner batch normalizes, sorts, and de-duplicates its email set. One of
-- the two unique addresses already belongs to a bowl member.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

create temporary table first_batch_result as
select public.create_bowl_invites(
  '10000000-0000-0000-0000-000000000071',
  array[' Friend@Example.com ', 'friend@example.com', 'already-member@example.com'],
  '40000000-0000-0000-0000-000000000074'
) as result;

select is(
  jsonb_array_length((select result->'invitations' from first_batch_result)),
  2,
  'duplicate addresses collapse to one per-address result'
);

select is(
  (
    select outcome->>'status'
    from first_batch_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'friend@example.com'
  ),
  'created',
  'a new address reports created'
);

select is(
  (
    select outcome->>'status'
    from first_batch_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'already-member@example.com'
  ),
  'already_member',
  'an existing bowl member does not receive an invitation'
);

select isnt(
  (
    select outcome->>'token'
    from first_batch_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'friend@example.com'
  ),
  null,
  'a newly created live invitation returns its server-generated token'
);

select is(
  (
    select outcome->>'invitation_id'
    from first_batch_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'already-member@example.com'
  ),
  null,
  'an already-member outcome does not return an invitation id'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and invited_email = 'friend@example.com'
      and accepted_at is null
  ),
  1,
  'a new address creates exactly one pending invitation'
);

select is(
  (
    select invited_email
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and lower(invited_email) = 'friend@example.com'
  ),
  'friend@example.com',
  'the persisted invitation address is normalized'
);

-- An existing live invitation is returned without adding another token.
insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token
)
values (
  '30000000-0000-0000-0000-000000000071',
  '10000000-0000-0000-0000-000000000071',
  'pending@example.com',
  '00000000-0000-0000-0000-000000000071',
  'existing-pending-token'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

create temporary table pending_batch_result as
select public.create_bowl_invites(
  '10000000-0000-0000-0000-000000000071',
  array['pending@example.com'],
  '40000000-0000-0000-0000-000000000075'
) as result;

select is(
  (select result->'invitations'->0->>'status' from pending_batch_result),
  'already_pending',
  'an existing live invitation reports already pending'
);

select is(
  (select result->'invitations'->0->>'invitation_id' from pending_batch_result),
  '30000000-0000-0000-0000-000000000071',
  'an already-pending outcome returns the existing invitation id'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and lower(btrim(invited_email)) = 'pending@example.com'
      and accepted_at is null
  ),
  1,
  'a duplicate live address still has one pending row'
);

-- Validation happens before the request record or any invitation insert.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000071',
      array['would-write@example.com', 'not-an-email'],
      '40000000-0000-0000-0000-000000000076'
    )
  $sql$,
  '22023',
  'One or more email addresses are invalid.',
  'one invalid address rejects the entire batch'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where lower(btrim(invited_email)) = 'would-write@example.com'
  ),
  0,
  'an invalid batch leaves no partial invitation rows'
);

select is(
  (
    select count(*)::int
    from public.bowl_invite_batches
    where request_id = '40000000-0000-0000-0000-000000000076'
  ),
  0,
  'an invalid batch leaves no request record'
);

-- A retry with the same key and normalized set returns the byte-for-byte
-- recorded result. Reordering the input does not change its set fingerprint.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.create_bowl_invites(
    '10000000-0000-0000-0000-000000000071',
    array['already-member@example.com', 'FRIEND@example.com'],
    '40000000-0000-0000-0000-000000000074'
  ),
  (select result from first_batch_result),
  'the same request key and email set replays its recorded result'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and lower(btrim(invited_email)) = 'friend@example.com'
  ),
  1,
  'an idempotent retry does not create another invitation row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000071',
      array['different@example.com'],
      '40000000-0000-0000-0000-000000000074'
    )
  $sql$,
  '22023',
  'This invitation request id was already used for a different batch.',
  'reusing a request key with different addresses is rejected'
);

reset role;

select is(
  (select count(*)::int from public.bowl_invites where invited_email = 'different@example.com'),
  0,
  'a conflicting idempotency key writes no new invitation'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.create_bowl_invites(
      '10000000-0000-0000-0000-000000000072',
      array['friend@example.com', 'already-member@example.com'],
      '40000000-0000-0000-0000-000000000074'
    )
  $sql$,
  '22023',
  'This invitation request id was already used for a different batch.',
  'reusing a request key for a different bowl is rejected'
);

reset role;

-- Acceptance between attempts never recreates the invitation and redacts its
-- now-dead id and token from the replay.
update public.bowl_invites
set accepted_at = now()
where bowl_id = '10000000-0000-0000-0000-000000000071'
  and invited_email = 'friend@example.com';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

create temporary table accepted_retry_result as
select public.create_bowl_invites(
  '10000000-0000-0000-0000-000000000071',
  array['friend@example.com', 'already-member@example.com'],
  '40000000-0000-0000-0000-000000000074'
) as result;

select is(
  (
    select outcome->>'status'
    from accepted_retry_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'friend@example.com'
  ),
  'created',
  'a retry after acceptance preserves the original outcome'
);

select is(
  (
    select outcome->>'token'
    from accepted_retry_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'friend@example.com'
  ),
  null,
  'a retry after acceptance does not expose the spent token'
);

select is(
  (
    select outcome->>'invitation_id'
    from accepted_retry_result,
      jsonb_array_elements(result->'invitations') outcome
    where outcome->>'invited_email' = 'friend@example.com'
  ),
  null,
  'a retry after acceptance does not expose the spent invitation id'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and invited_email = 'friend@example.com'
      and accepted_at is null
  ),
  0,
  'a retry after acceptance creates no new pending invitation'
);

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and invited_email = 'friend@example.com'
  ),
  1,
  'a retry after acceptance leaves the single historical row intact'
);

-- A pending invite can be revoked once. Retrying its original batch returns
-- the recorded status without restoring the deleted row or token.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.revoke_bowl_invite(
    '10000000-0000-0000-0000-000000000071',
    '30000000-0000-0000-0000-000000000071'
  ),
  'revoked',
  'an owner can revoke a pending invitation'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where id = '30000000-0000-0000-0000-000000000071'
  ),
  0,
  'a successful revoke removes the pending row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

create temporary table revoked_retry_result as
select public.create_bowl_invites(
  '10000000-0000-0000-0000-000000000071',
  array['pending@example.com'],
  '40000000-0000-0000-0000-000000000075'
) as result;

select is(
  (select result->'invitations'->0->>'status' from revoked_retry_result),
  'already_pending',
  'a retry after revoke preserves the original outcome'
);

select is(
  (select result->'invitations'->0->>'token' from revoked_retry_result),
  null,
  'a retry after revoke does not expose the revoked token'
);

select is(
  (select result->'invitations'->0->>'invitation_id' from revoked_retry_result),
  null,
  'a retry after revoke does not expose the revoked invitation id'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and invited_email = 'pending@example.com'
  ),
  0,
  'a retry after revoke does not recreate the invitation'
);

-- If acceptance wins before revoke locks the row, revoke reports it and keeps
-- the history instead of deleting it.
insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token,
  accepted_at
)
values (
  '30000000-0000-0000-0000-000000000072',
  '10000000-0000-0000-0000-000000000071',
  'accepted-before-revoke@example.com',
  '00000000-0000-0000-0000-000000000071',
  'accepted-before-revoke-token',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.revoke_bowl_invite(
    '10000000-0000-0000-0000-000000000071',
    '30000000-0000-0000-0000-000000000072'
  ),
  'already_accepted',
  'revoke reports an invitation accepted before its row lock'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where id = '30000000-0000-0000-0000-000000000072'
  ),
  1,
  'an accepted invitation remains as history after revoke'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.revoke_bowl_invite(
    '10000000-0000-0000-0000-000000000071',
    '30000000-0000-0000-0000-000000000099'
  ),
  'not_pending',
  'a missing invitation reports not pending to its bowl owner'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000072","email":"batch-member@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.revoke_bowl_invite(
      '10000000-0000-0000-0000-000000000071',
      '30000000-0000-0000-0000-000000000072'
    )
  $sql$,
  '42501',
  'This invitation is unavailable or you are not allowed to manage it.',
  'a non-owner member cannot revoke an invitation'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000073","email":"batch-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.revoke_bowl_invite(
      '10000000-0000-0000-0000-000000000071',
      '30000000-0000-0000-0000-000000000072'
    )
  $sql$,
  '42501',
  'This invitation is unavailable or you are not allowed to manage it.',
  'a non-member cannot revoke an invitation'
);

reset role;

-- The owner cannot fall back to either direct write. DELETE remains granted
-- only so the invitee-address policy can authorize decline and leave cleanup.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    insert into public.bowl_invites (
      bowl_id,
      invited_email,
      invited_by,
      token
    )
    values (
      '10000000-0000-0000-0000-000000000071',
      'direct-owner@example.com',
      '00000000-0000-0000-0000-000000000071',
      'direct-owner-token'
    )
  $sql$,
  '42501',
  'permission denied for table bowl_invites',
  'an owner direct insert is denied after the RPC cutover'
);

create temporary table owner_direct_delete_result as
with deleted as (
  delete from public.bowl_invites
  where id = '30000000-0000-0000-0000-000000000072'
  returning id
)
select count(*)::int as deleted_count from deleted;

select is(
  (select deleted_count from owner_direct_delete_result),
  0,
  'an owner direct delete cannot see an invitation through invitee-only policy'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where id = '30000000-0000-0000-0000-000000000072'
  ),
  1,
  'the denied owner direct delete leaves its target intact'
);

-- Received-invitation decline remains a narrowly scoped direct delete.
insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token
)
values (
  '30000000-0000-0000-0000-000000000073',
  '10000000-0000-0000-0000-000000000071',
  'Decline@Example.com',
  '00000000-0000-0000-0000-000000000071',
  'decline-token'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000075","email":"decline@example.com","role":"authenticated"}',
  true
);

create temporary table decline_delete_result as
with deleted as (
  delete from public.bowl_invites
  where id = '30000000-0000-0000-0000-000000000073'
  returning id
)
select count(*)::int as deleted_count from deleted;

select is(
  (select deleted_count from decline_delete_result),
  1,
  'an invitee can still decline their invitation'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where id = '30000000-0000-0000-0000-000000000073'
  ),
  0,
  'decline removes the invitee-scoped row'
);

-- Leaving a bowl deletes the member row first and then the leaving account's
-- accepted invitation history. Both existing client operations remain legal.
insert into public.bowl_members (bowl_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000076',
  'Member'
);

insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token,
  accepted_at
)
values (
  '30000000-0000-0000-0000-000000000074',
  '10000000-0000-0000-0000-000000000071',
  'leave@example.com',
  '00000000-0000-0000-0000-000000000071',
  'leave-token',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000076","email":"leave@example.com","role":"authenticated"}',
  true
);

create temporary table leave_member_delete_result as
with deleted as (
  delete from public.bowl_members
  where bowl_id = '10000000-0000-0000-0000-000000000071'
    and user_id = '00000000-0000-0000-0000-000000000076'
  returning user_id
)
select count(*)::int as deleted_count from deleted;

select is(
  (select deleted_count from leave_member_delete_result),
  1,
  'a non-owner can still remove their own membership'
);

create temporary table leave_invite_delete_result as
with deleted as (
  delete from public.bowl_invites
  where bowl_id = '10000000-0000-0000-0000-000000000071'
    and invited_email = 'leave@example.com'
  returning id
)
select count(*)::int as deleted_count from deleted;

select is(
  (select deleted_count from leave_invite_delete_result),
  1,
  'a leaving account can still clean up its invitation history'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and user_id = '00000000-0000-0000-0000-000000000076'
  ) + (
    select count(*)::int
    from public.bowl_invites
    where id = '30000000-0000-0000-0000-000000000074'
  ),
  0,
  'leave cleanup removes both the membership and invite history'
);

-- Invitees can no longer finalize acceptance with a direct UPDATE.
insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token
)
values (
  '30000000-0000-0000-0000-000000000075',
  '10000000-0000-0000-0000-000000000071',
  'update@example.com',
  '00000000-0000-0000-0000-000000000071',
  'update-token'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000077","email":"update@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    update public.bowl_invites
    set accepted_at = now()
    where id = '30000000-0000-0000-0000-000000000075'
  $sql$,
  '42501',
  'permission denied for table bowl_invites',
  'invitees cannot bypass atomic acceptance with a direct update'
);

reset role;

-- Accepted history does not block a later pending invitation for the same
-- normalized address.
insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token,
  accepted_at
)
values (
  '30000000-0000-0000-0000-000000000076',
  '10000000-0000-0000-0000-000000000071',
  'history@example.com',
  '00000000-0000-0000-0000-000000000071',
  'history-token',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"batch-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.create_bowl_invites(
    '10000000-0000-0000-0000-000000000071',
    array['HISTORY@example.com'],
    '40000000-0000-0000-0000-000000000077'
  )->'invitations'->0->>'status',
  'created',
  'accepted history can coexist with a later pending invitation'
);

reset role;

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and lower(btrim(invited_email)) = 'history@example.com'
  ),
  2,
  're-inviting after acceptance preserves one history row and one live row'
);

select is(
  (
    select count(*)::int
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000071'
      and lower(btrim(invited_email)) = 'history@example.com'
      and accepted_at is null
  ),
  1,
  'the partial uniqueness rule permits only one of those rows to remain pending'
);

select * from finish();
rollback;

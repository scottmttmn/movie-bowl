-- Invitation creation previously depended on direct browser inserts carrying
-- browser-generated tokens. A retry could therefore create multiple live
-- invitations for the same bowl and address, and a revoke racing acceptance
-- could delete an already-accepted row while still reporting success.
--
-- The linked production schema was audited immediately before this migration:
-- it contained eight historical invitation rows, zero pending rows, and zero
-- duplicate pending groups. Refuse to add the uniqueness rule if that changes
-- before deployment so operators can resolve the rows deliberately.

begin;

do $$
begin
  if exists (
    select 1
    from public.bowl_invites
    where accepted_at is null
    group by bowl_id, lower(btrim(invited_email))
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate pending bowl invitations before applying this migration.';
  end if;
end;
$$;

create unique index bowl_invites_one_pending_per_email_idx
  on public.bowl_invites (bowl_id, lower(btrim(invited_email)))
  where accepted_at is null;

create table public.bowl_invite_batches (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  normalized_emails text[] not null,
  payload_fingerprint text not null,
  results jsonb,
  created_at timestamptz not null default now(),
  constraint bowl_invite_batches_request_key unique (requested_by, request_id),
  constraint bowl_invite_batches_results_array check (
    results is null or jsonb_typeof(results) = 'array'
  )
);

alter table public.bowl_invite_batches enable row level security;

revoke all on table public.bowl_invite_batches from public, anon, authenticated;
grant all on table public.bowl_invite_batches to service_role;

comment on table public.bowl_invite_batches is
  'Private, persisted invitation-batch outcomes keyed to the authenticated caller and client request UUID.';

create or replace function public.create_bowl_invites(
  p_bowl_id uuid,
  p_emails text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_emails text[];
  v_fingerprint text;
  v_batch public.bowl_invite_batches%rowtype;
  v_email text;
  v_invite_id uuid;
  v_token text;
  v_status text;
  v_is_member boolean;
  v_results jsonb := '[]'::jsonb;
  v_replay_results jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to manage bowl invitations.'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'An invitation request id is required.'
      using errcode = '22023';
  end if;

  -- Missing bowls and bowls owned by someone else deliberately share one
  -- response. This function bypasses RLS and must not reveal their existence.
  if p_bowl_id is null or not exists (
    select 1
    from public.bowls
    where id = p_bowl_id
      and owner_id = v_user_id
  ) then
    raise exception 'This bowl is unavailable or you are not allowed to manage its invitations.'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(normalized_email order by normalized_email), array[]::text[])
  into v_emails
  from (
    select distinct lower(btrim(raw_email)) as normalized_email
    from unnest(coalesce(p_emails, array[]::text[])) as input(raw_email)
    where nullif(btrim(raw_email), '') is not null
  ) normalized;

  if cardinality(v_emails) = 0 then
    raise exception 'Enter at least one email address.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_emails) as normalized(email)
    where email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'One or more email addresses are invalid.'
      using errcode = '22023';
  end if;

  v_fingerprint := md5(
    p_bowl_id::text || E'\n' || array_to_string(v_emails, E'\n')
  );

  insert into public.bowl_invite_batches (
    requested_by,
    request_id,
    bowl_id,
    normalized_emails,
    payload_fingerprint
  )
  values (
    v_user_id,
    p_request_id,
    p_bowl_id,
    v_emails,
    v_fingerprint
  )
  on conflict (requested_by, request_id) do nothing
  returning * into v_batch;

  if v_batch.id is null then
    select *
    into v_batch
    from public.bowl_invite_batches
    where requested_by = v_user_id
      and request_id = p_request_id
    for update;

    if v_batch.id is null or v_batch.results is null then
      raise exception 'The saved invitation request could not be read.';
    end if;

    if v_batch.bowl_id <> p_bowl_id
      or v_batch.payload_fingerprint <> v_fingerprint
      or v_batch.normalized_emails <> v_emails then
      raise exception 'This invitation request id was already used for a different batch.'
        using errcode = '22023';
    end if;

    -- Preserve recorded outcomes after acceptance or revoke, but never return
    -- a token that no longer identifies a live invitation. Most importantly,
    -- a replay never recreates a row or rotates a token.
    select coalesce(
      jsonb_agg(
        case
          when outcome.value->>'token' is null then outcome.value
          when exists (
            select 1
            from public.bowl_invites invite
            where invite.id = nullif(outcome.value->>'invitation_id', '')::uuid
              and invite.token = outcome.value->>'token'
              and invite.accepted_at is null
          ) then outcome.value
          else jsonb_set(
            jsonb_set(outcome.value, '{invitation_id}', 'null'::jsonb, true),
            '{token}',
            'null'::jsonb,
            true
          )
        end
        order by outcome.ordinality
      ),
      '[]'::jsonb
    )
    into v_replay_results
    from jsonb_array_elements(v_batch.results) with ordinality as outcome(value, ordinality);

    return jsonb_build_object(
      'request_id', p_request_id,
      'bowl_id', p_bowl_id,
      'invitations', v_replay_results
    );
  end if;

  foreach v_email in array v_emails loop
    v_invite_id := null;
    v_token := null;

    select exists (
      select 1
      from public.bowl_members member
      join public.profiles profile on profile.id = member.user_id
      where member.bowl_id = p_bowl_id
        and lower(btrim(profile.email)) = v_email
    )
    into v_is_member;

    if v_is_member then
      v_status := 'already_member';
    else
      select id, token
      into v_invite_id, v_token
      from public.bowl_invites
      where bowl_id = p_bowl_id
        and lower(btrim(invited_email)) = v_email
        and accepted_at is null
      for update;

      if found then
        v_status := 'already_pending';
      else
        v_invite_id := gen_random_uuid();
        v_token := gen_random_uuid()::text;

        insert into public.bowl_invites (
          id,
          bowl_id,
          invited_email,
          invited_by,
          token
        )
        values (
          v_invite_id,
          p_bowl_id,
          v_email,
          v_user_id,
          v_token
        )
        on conflict (bowl_id, (lower(btrim(invited_email))))
          where accepted_at is null
          do nothing
        returning id, token into v_invite_id, v_token;

        if found then
          v_status := 'created';
        else
          -- A concurrent batch may have won the partial-unique race. Return
          -- the one live invitation instead of surfacing a transient conflict.
          select id, token
          into v_invite_id, v_token
          from public.bowl_invites
          where bowl_id = p_bowl_id
            and lower(btrim(invited_email)) = v_email
            and accepted_at is null
          for update;

          if v_invite_id is null then
            raise exception 'The invitation could not be created.';
          end if;

          v_status := 'already_pending';
        end if;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'invited_email', v_email,
        'status', v_status,
        'invitation_id', v_invite_id,
        'token', v_token
      )
    );
  end loop;

  update public.bowl_invite_batches
  set results = v_results
  where id = v_batch.id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'bowl_id', p_bowl_id,
    'invitations', v_results
  );
end;
$$;

revoke all on function public.create_bowl_invites(uuid, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.create_bowl_invites(uuid, text[], uuid)
  to authenticated;

comment on function public.create_bowl_invites(uuid, text[], uuid) is
  'Creates an owner-authorized invitation batch once per caller request UUID and replays its recorded outcomes safely.';

create or replace function public.revoke_bowl_invite(
  p_bowl_id uuid,
  p_invitation_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.bowl_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to manage bowl invitations.'
      using errcode = '42501';
  end if;

  if p_bowl_id is null or not exists (
    select 1
    from public.bowls
    where id = p_bowl_id
      and owner_id = v_user_id
  ) then
    raise exception 'This invitation is unavailable or you are not allowed to manage it.'
      using errcode = '42501';
  end if;

  select *
  into v_invite
  from public.bowl_invites
  where id = p_invitation_id
    and bowl_id = p_bowl_id
  for update;

  if v_invite.id is null then
    return 'not_pending';
  end if;

  if v_invite.accepted_at is not null then
    return 'already_accepted';
  end if;

  delete from public.bowl_invites
  where id = v_invite.id;

  return 'revoked';
end;
$$;

revoke all on function public.revoke_bowl_invite(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_bowl_invite(uuid, uuid)
  to authenticated;

comment on function public.revoke_bowl_invite(uuid, uuid) is
  'Revokes an owner-managed pending invitation under a row lock and reports accepted or missing races explicitly.';

-- All owner creation/revoke callers move to the functions above in the same
-- release. Invitees still need SELECT and DELETE for the inbox decline path and
-- the cleanup that follows leaving a bowl. Acceptance already uses its atomic
-- function, so direct invite UPDATE is no longer needed.
drop policy if exists "Owners can create bowl invites" on public.bowl_invites;
drop policy if exists "Owners can delete bowl invites" on public.bowl_invites;
drop policy if exists "Invited user can update invite" on public.bowl_invites;

revoke all on table public.bowl_invites from public, anon;
revoke insert, update, truncate, references, trigger
  on table public.bowl_invites from authenticated;
grant select, delete on table public.bowl_invites to authenticated;
grant all on table public.bowl_invites to service_role;

commit;

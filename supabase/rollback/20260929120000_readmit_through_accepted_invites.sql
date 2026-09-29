-- Reverts 20260929120000_stop_accepted_invites_readmitting.sql. Move into
-- migrations/ with a fresh timestamp to run it.
--
-- This knowingly reopens the bypass that migration closed: an account removed
-- from a bowl, or one that left, can rejoin by accepting the invite it already
-- used. It also restores execute on the legacy queue helper to whatever the
-- database's default function privileges grant.

begin;

create or replace function public.accept_bowl_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.bowl_invites%rowtype;
  v_bowl_id uuid;
  v_email text := lower(trim(coalesce(auth.email(), '')));
  v_token text := nullif(trim(coalesce(p_token, '')), '');
begin
  if auth.uid() is null or v_email = '' then
    raise exception 'You must be signed in to accept an invite.'
      using errcode = '42501';
  end if;

  if v_token is not null then
    select *
    into v_invite
    from public.bowl_invites
    where token = v_token
    for update;
  end if;

  -- Missing, mismatched, and someone else's invites share one outcome. This
  -- function bypasses RLS, so distinguishing them would let whoever holds a
  -- token learn that an invite exists and who it was addressed to.
  if v_invite.id is null
    or lower(trim(coalesce(v_invite.invited_email, ''))) <> v_email then
    raise exception 'This invite is no longer available. It may have been used already, or it was sent to a different account.'
      using errcode = 'P0001';
  end if;

  select id
  into v_bowl_id
  from public.bowls
  where id = v_invite.bowl_id
  for key share;

  if v_bowl_id is null then
    raise exception 'This bowl is no longer available.'
      using errcode = 'P0001';
  end if;

  insert into public.bowl_members (bowl_id, user_id, role)
  values (v_invite.bowl_id, auth.uid(), 'Member')
  on conflict do nothing;

  -- An invite already marked accepted still finalizes here rather than being
  -- refused: the same person is entitled to the bowl, so a retry repairs a
  -- half-finished acceptance instead of stranding it. coalesce keeps the
  -- original timestamp so a repeat cannot rewrite when the join happened.
  update public.bowl_invites
  set accepted_at = coalesce(accepted_at, now())
  where id = v_invite.id;

  return v_invite.bowl_id;
end;
$$;

revoke all on function public.accept_bowl_invite(text) from public, anon, authenticated;
grant execute on function public.accept_bowl_invite(text) to authenticated;

comment on function public.accept_bowl_invite(text) is
  'Joins the caller to the invited bowl and finalizes that invite in one transaction; idempotent on retry.';

grant execute on function public.promote_queued_movies_for_bowl(uuid) to public;

commit;

-- Removing a member or leaving a bowl deletes only the bowl_members row, and
-- accept_bowl_invite recreated that row for any invite addressed to the caller,
-- accepted or not. So an account that kept its invite link could undo its own
-- removal. An accepted invite now only confirms a membership that still
-- exists; getting back in after removal takes a new invite.
--
-- A pending invite still admits, including the old two-write partial state
-- where membership landed but the invite was never marked accepted.
--
-- Also revokes direct execution of the legacy queue helper. It is a definer
-- function with no caller check, and it was never meant to be an RPC: the
-- queue triggers and refresh_bowl_queue_promotions are definers themselves, so
-- they call it as its owner and do not need the grant.

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
  v_unavailable constant text :=
    'This invite is no longer available. It may have been used already, or it was sent to a different account.';
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
    raise exception '%', v_unavailable using errcode = 'P0001';
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

  -- An invite is spent once accepted. Repeating it is harmless only while the
  -- membership it created is still there; after a removal or a leave the same
  -- refusal as a used token, and never an insert. Nothing here needs to race
  -- a concurrent removal, because this branch never writes membership.
  if v_invite.accepted_at is not null then
    if not exists (
      select 1
      from public.bowl_members
      where bowl_id = v_invite.bowl_id
        and user_id = auth.uid()
    ) then
      raise exception '%', v_unavailable using errcode = 'P0001';
    end if;

    return v_invite.bowl_id;
  end if;

  insert into public.bowl_members (bowl_id, user_id, role)
  values (v_invite.bowl_id, auth.uid(), 'Member')
  on conflict do nothing;

  update public.bowl_invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.bowl_id;
end;
$$;

revoke all on function public.accept_bowl_invite(text) from public, anon, authenticated;
grant execute on function public.accept_bowl_invite(text) to authenticated;

comment on function public.accept_bowl_invite(text) is
  'Joins the caller to the invited bowl and finalizes that invite in one transaction. A repeat succeeds only while the membership still exists.';

revoke all on function public.promote_queued_movies_for_bowl(uuid) from public, anon, authenticated;

commit;

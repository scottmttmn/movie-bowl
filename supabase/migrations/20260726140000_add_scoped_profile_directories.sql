-- Add narrow profile lookup paths before tightening the broad profiles SELECT policy.
-- These functions expose only user IDs and emails that the caller needs for a
-- bowl they can access or for invitations sent directly to their email address.

begin;

create or replace function public.get_bowl_profile_directory(p_bowl_id uuid)
returns table (
  user_id uuid,
  email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if not (
    public.is_bowl_owner(p_bowl_id)
    or public.is_bowl_member(p_bowl_id)
  ) then
    raise exception 'Bowl access required'
      using errcode = '42501';
  end if;

  return query
  with related_users as (
    select b.owner_id as id
    from public.bowls b
    where b.id = p_bowl_id

    union

    select bm.user_id as id
    from public.bowl_members bm
    where bm.bowl_id = p_bowl_id

    union

    select movie.added_by as id
    from public.bowl_movies movie
    where movie.bowl_id = p_bowl_id

    union

    select event.added_by as id
    from public.bowl_draw_events event
    where event.bowl_id = p_bowl_id
  )
  select profile.id as user_id, profile.email
  from related_users related
  join public.profiles profile on profile.id = related.id
  order by lower(profile.email), profile.id;
end;
$$;

comment on function public.get_bowl_profile_directory(uuid) is
  'Returns IDs and emails for the owner, members, and movie contributors associated with a bowl the caller can access.';

revoke all on function public.get_bowl_profile_directory(uuid)
  from public, anon, authenticated;
grant execute on function public.get_bowl_profile_directory(uuid)
  to authenticated;

create or replace function public.get_my_invite_sender_directory()
returns table (
  user_id uuid,
  email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_email text := auth.email();
begin
  if auth.uid() is null or caller_email is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  return query
  select profile.id as user_id, profile.email
  from public.bowl_invites invite
  join public.profiles profile on profile.id = invite.invited_by
  where invite.accepted_at is null
    and lower(invite.invited_email) = lower(caller_email)
  group by profile.id, profile.email
  order by lower(profile.email), profile.id;
end;
$$;

comment on function public.get_my_invite_sender_directory() is
  'Returns IDs and emails only for senders of the authenticated user''s pending bowl invitations.';

revoke all on function public.get_my_invite_sender_directory()
  from public, anon, authenticated;
grant execute on function public.get_my_invite_sender_directory()
  to authenticated;

commit;

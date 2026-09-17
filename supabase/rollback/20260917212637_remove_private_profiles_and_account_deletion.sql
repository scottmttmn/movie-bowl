-- Revert the profile-directory shape and remove the account-management RPCs.
-- This cannot restore account data already removed by the deletion endpoint.

begin;

drop function if exists public.delete_account_data_for_user(uuid, text);
drop function if exists public.transfer_owned_bowl(uuid, uuid);

drop function public.get_bowl_profile_directory(uuid);

create function public.get_bowl_profile_directory(p_bowl_id uuid)
returns table (
  user_id uuid,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
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
    select bowl.owner_id as id
    from public.bowls bowl
    where bowl.id = p_bowl_id

    union

    select member.user_id as id
    from public.bowl_members member
    where member.bowl_id = p_bowl_id

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

revoke all on function public.get_bowl_profile_directory(uuid)
from public, anon, authenticated;
grant execute on function public.get_bowl_profile_directory(uuid)
to authenticated;

drop function public.get_my_invite_sender_directory();

create function public.get_my_invite_sender_directory()
returns table (
  user_id uuid,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
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

revoke all on function public.get_my_invite_sender_directory()
from public, anon, authenticated;
grant execute on function public.get_my_invite_sender_directory()
to authenticated;

alter table public.profiles
  drop constraint if exists profiles_display_name_check,
  drop column if exists display_name;

commit;

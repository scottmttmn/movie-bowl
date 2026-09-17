-- Replace shared email identity with bowl-scoped display names, add an atomic
-- ownership-transfer path, and provide the server-only cleanup half of account
-- deletion. The Auth user itself is deleted by the trusted API after cleanup.

begin;

alter table public.profiles
  add column display_name text;

alter table public.profiles
  add constraint profiles_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
    )
  );

comment on column public.profiles.display_name is
  'User-chosen bowl identity. Not unique and never used for authorization.';

-- PostgreSQL cannot replace a table-returning function when its output shape
-- changes. Drop only these narrow public entry points, then recreate them with
-- display names instead of email addresses.
drop function public.get_bowl_profile_directory(uuid);

create function public.get_bowl_profile_directory(p_bowl_id uuid)
returns table (
  user_id uuid,
  display_name text
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
  select profile.id as user_id, profile.display_name
  from related_users related
  join public.profiles profile on profile.id = related.id
  order by lower(profile.display_name) nulls last, profile.id;
end;
$$;

comment on function public.get_bowl_profile_directory(uuid) is
  'Returns IDs and display names for people associated with a bowl the caller can access.';

revoke all on function public.get_bowl_profile_directory(uuid)
from public, anon, authenticated;
grant execute on function public.get_bowl_profile_directory(uuid)
to authenticated;

drop function public.get_my_invite_sender_directory();

create function public.get_my_invite_sender_directory()
returns table (
  user_id uuid,
  display_name text
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
  select profile.id as user_id, profile.display_name
  from public.bowl_invites invite
  join public.profiles profile on profile.id = invite.invited_by
  where invite.accepted_at is null
    and lower(invite.invited_email) = lower(caller_email)
  group by profile.id, profile.display_name
  order by lower(profile.display_name) nulls last, profile.id;
end;
$$;

comment on function public.get_my_invite_sender_directory() is
  'Returns IDs and display names only for senders of the caller pending invitations.';

revoke all on function public.get_my_invite_sender_directory()
from public, anon, authenticated;
grant execute on function public.get_my_invite_sender_directory()
to authenticated;

create function public.transfer_owned_bowl(
  p_bowl_id uuid,
  p_new_owner_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_draw_access_mode text;
begin
  if v_owner_id is null then
    raise exception 'You must be signed in to transfer a bowl.'
      using errcode = '42501';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_owner_id then
    raise exception 'Choose another current member as the new owner.'
      using errcode = '22023';
  end if;

  select bowl.draw_access_mode
  into v_draw_access_mode
  from public.bowls bowl
  where bowl.id = p_bowl_id
    and bowl.owner_id = v_owner_id
  for update;

  if not found then
    raise exception 'Only the bowl owner can transfer this bowl.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.bowl_members member
    where member.bowl_id = p_bowl_id
      and member.user_id = p_new_owner_id
  ) then
    raise exception 'The new owner must already be a member of this bowl.'
      using errcode = '22023';
  end if;

  update public.bowls
  set owner_id = p_new_owner_id,
      updated_at = now()
  where id = p_bowl_id;

  -- Older bowls are not guaranteed to have a redundant membership row for
  -- their owner, so upsert both sides instead of assuming that row exists.
  insert into public.bowl_members (bowl_id, user_id, role)
  values
    (p_bowl_id, v_owner_id, 'Member'),
    (p_bowl_id, p_new_owner_id, 'Owner')
  on conflict (bowl_id, user_id) do update
  set role = excluded.role,
      updated_at = now();

  -- Owners are implicitly allowed to draw and should not also occupy a selected
  -- permission row. Preserve the former owner's effective access after transfer.
  delete from public.bowl_draw_permissions
  where bowl_id = p_bowl_id
    and user_id = p_new_owner_id;

  if v_draw_access_mode = 'selected_members' then
    insert into public.bowl_draw_permissions (bowl_id, user_id)
    values (p_bowl_id, v_owner_id)
    on conflict (bowl_id, user_id) do nothing;
  end if;

  return p_new_owner_id;
end;
$$;

comment on function public.transfer_owned_bowl(uuid, uuid) is
  'Atomically transfers a bowl to another current member while preserving the former owner as a member.';

revoke all on function public.transfer_owned_bowl(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.transfer_owned_bowl(uuid, uuid)
to authenticated;

-- Trusted-server-only and deliberately idempotent. It removes every row that
-- either authorizes the account or contains personal account data, while
-- retaining completed group history without an identifiable contributor.
create function public.delete_account_data_for_user(
  p_user_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owned_bowls jsonb;
  v_profile_email text;
  v_removed_movies bigint := 0;
begin
  if p_user_id is null then
    raise exception 'A user ID is required.'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', bowl.id, 'name', bowl.name)
      order by lower(btrim(bowl.name)) collate "C", bowl.id
    ),
    '[]'::jsonb
  )
  into v_owned_bowls
  from public.bowls bowl
  where bowl.owner_id = p_user_id;

  if jsonb_array_length(v_owned_bowls) > 0 then
    return jsonb_build_object(
      'deleted', false,
      'code', 'owned_bowls',
      'owned_bowls', v_owned_bowls
    );
  end if;

  select profile.email
  into v_profile_email
  from public.profiles profile
  where profile.id = p_user_id;

  -- Delete queued rows first so deleting active slips cannot promote another
  -- contribution from the account that is being removed.
  delete from public.bowl_movie_queue
  where queued_by = p_user_id;

  delete from public.bowl_movies
  where added_by = p_user_id;
  get diagnostics v_removed_movies = row_count;

  update public.bowl_movies
  set drawn_by = null
  where drawn_by = p_user_id;

  update public.bowl_draw_events
  set added_by = null,
      added_by_name = 'Former member',
      note = null
  where added_by = p_user_id;

  update public.bowl_draw_events
  set drawn_by = null
  where drawn_by = p_user_id;

  update public.bowl_draw_events
  set returned_by = null
  where returned_by = p_user_id;

  delete from public.user_watch_events
  where user_id = p_user_id;

  delete from public.bowl_invites
  where invited_by = p_user_id
     or (
       coalesce(nullif(btrim(p_email), ''), nullif(btrim(v_profile_email), '')) is not null
       and lower(invited_email) = lower(
         coalesce(nullif(btrim(p_email), ''), nullif(btrim(v_profile_email), ''))
       )
     );

  delete from public.bowl_invite_batches
  where requested_by = p_user_id;

  delete from public.bowl_add_links
  where created_by = p_user_id;

  delete from public.bowl_draw_permissions
  where user_id = p_user_id;

  delete from public.bowl_members
  where user_id = p_user_id;

  delete from public.user_bowl_defaults
  where user_id = p_user_id;

  -- Pairing requests are short-lived credentials, not durable group history.
  -- Deleting them also avoids leaving the approval-consistency constraint in
  -- an impossible state when Auth later nulls approved_by.
  delete from public.tv_pairing_requests
  where approved_by = p_user_id;

  delete from public.profiles
  where id = p_user_id;

  return jsonb_build_object(
    'deleted', true,
    'removed_movies', v_removed_movies
  );
end;
$$;

comment on function public.delete_account_data_for_user(uuid, text) is
  'Server-only cleanup executed immediately before the matching Supabase Auth user is hard-deleted.';

revoke all on function public.delete_account_data_for_user(uuid, text)
from public, anon, authenticated;
grant execute on function public.delete_account_data_for_user(uuid, text)
to service_role;

commit;

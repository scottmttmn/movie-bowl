-- Replace a bowl's draw access mode and selected-member list in one
-- owner-authorized transaction.

begin;

create or replace function public.save_bowl_draw_access(
  p_bowl_id uuid,
  p_mode text,
  p_allowed_user_ids uuid[] default '{}'::uuid[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_selected_user_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to update draw access.'
      using errcode = '42501';
  end if;

  select bowl.owner_id
  into v_owner_id
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can update draw access.'
      using errcode = '42501';
  end if;

  if p_mode is null
    or p_mode not in ('all_members', 'selected_members')
  then
    raise exception 'Invalid draw access mode.'
      using errcode = 'P0001';
  end if;

  v_selected_user_ids := array(
    select distinct selected.user_id
    from unnest(coalesce(p_allowed_user_ids, '{}'::uuid[])) selected(user_id)
    where selected.user_id is not null
    order by selected.user_id
  );

  if p_mode = 'selected_members'
    and exists (
      select 1
      from unnest(v_selected_user_ids) selected(user_id)
      where selected.user_id = v_owner_id
        or not exists (
          select 1
          from public.bowl_members member
          where member.bowl_id = p_bowl_id
            and member.user_id = selected.user_id
        )
    )
  then
    raise exception 'Draw access can only be granted to current bowl members.'
      using errcode = 'P0001';
  end if;

  update public.bowls
  set draw_access_mode = p_mode
  where id = p_bowl_id;

  delete from public.bowl_draw_permissions
  where bowl_id = p_bowl_id;

  if p_mode = 'selected_members' then
    insert into public.bowl_draw_permissions (bowl_id, user_id)
    select p_bowl_id, selected.user_id
    from unnest(v_selected_user_ids) selected(user_id);
  end if;

  return p_mode;
end;
$$;

revoke all on function public.save_bowl_draw_access(uuid, text, uuid[])
from public, anon, authenticated;

grant execute on function public.save_bowl_draw_access(uuid, text, uuid[])
to authenticated;

comment on function public.save_bowl_draw_access(uuid, text, uuid[]) is
  'Atomically replaces draw access settings for a bowl owned by the authenticated user.';

commit;

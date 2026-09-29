-- Reverts 20260929230000_close_bowl_members_write_policies.sql by restoring the
-- four policies and the helper as production had them. Only for recovering from
-- a regression the drop itself caused.

begin;

create or replace function public.is_bowl_owner_member(bid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bowl_members
    where bowl_id = bid
      and user_id = auth.uid()
      and role = 'Owner'
  );
$$;

create policy "Invited user can join bowl via invite"
on public.bowl_members
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.bowl_invites bi
    join public.profiles p on p.id = auth.uid()
    where bi.bowl_id = bowl_members.bowl_id
      and lower(bi.invited_email) = lower(p.email)
      and bi.accepted_at is null
  )
);

create policy "bowl_members_insert_owner_only"
on public.bowl_members
for insert
with check (public.is_bowl_owner_member(bowl_id));

create policy "bowl_members_update_owner_only"
on public.bowl_members
for update
using (public.is_bowl_owner_member(bowl_id))
with check (public.is_bowl_owner_member(bowl_id));

create policy "bowl_members_delete_owner_only"
on public.bowl_members
for delete
using (public.is_bowl_owner_member(bowl_id));

commit;

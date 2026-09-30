-- Reverts 20260930010000_guard_pack_claim_origin.sql, restoring the policies
-- from 20260726153000. Run it before the 20260930000000 rollback, which drops
-- the columns these policies read.

begin;

drop policy if exists bowl_movies_insert_own_undrawn on public.bowl_movies;

create policy bowl_movies_insert_own_undrawn
on public.bowl_movies
for insert
to authenticated
with check (
  (
    public.is_bowl_owner(bowl_id)
    or public.is_bowl_member(bowl_id)
  )
  and added_by = auth.uid()
  and drawn_at is null
  and drawn_by is null
  and added_by_name is null
  and added_via_link_id is null
);

drop policy if exists bowl_movies_delete_owner_or_own_undrawn on public.bowl_movies;

create policy bowl_movies_delete_owner_or_own_undrawn
on public.bowl_movies
for delete
to authenticated
using (
  public.is_bowl_owner(bowl_id)
  or (
    public.is_bowl_member(bowl_id)
    and added_by = auth.uid()
    and drawn_at is null
  )
);

commit;

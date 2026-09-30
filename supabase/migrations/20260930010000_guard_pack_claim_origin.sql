-- Two ways around remove_own_bowl_movie, closed at the table.
--
-- A claim's origin is what turns a delete into a return, so only the claim
-- itself may write it. Members insert their own titles directly, and nothing
-- stopped that insert from carrying an origin of its own choosing; a title
-- that arrived that way would be "returned" to a pack it was never in.
--
-- And a claim should leave the bowl only through remove_own_bowl_movie. A tab
-- opened before 20260930000000 still deletes directly, which would take a
-- claimed title out for good. A direct delete now leaves claimed rows alone;
-- the old tab reports the title as no longer available, and a reload puts it
-- on the new path. Cascades from a bowl deletion do not pass through RLS.

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
  and claimed_from_starter_pack is null
  and claimed_from_starter_pack_name is null
);

drop policy if exists bowl_movies_delete_owner_or_own_undrawn on public.bowl_movies;

create policy bowl_movies_delete_owner_or_own_undrawn
on public.bowl_movies
for delete
to authenticated
using (
  (
    public.is_bowl_owner(bowl_id)
    or (
      public.is_bowl_member(bowl_id)
      and added_by = auth.uid()
      and drawn_at is null
    )
  )
  and claimed_from_starter_pack is null
);

commit;

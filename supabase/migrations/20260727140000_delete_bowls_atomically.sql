-- Delete an owned bowl and all bowl-owned data in one transaction while
-- preserving durable draw records and each participant's personal history.

begin;

create or replace function public.delete_owned_bowl(p_bowl_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to delete a bowl.'
      using errcode = '42501';
  end if;

  select bowl.owner_id
  into v_owner_id
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can delete this bowl.'
      using errcode = '42501';
  end if;

  -- Detach both durable references before deleting their parents. Relying on
  -- two separate ON DELETE SET NULL cascades can violate the still-immediate
  -- source movie foreign key when PostgreSQL processes them in either order.
  update public.bowl_draw_events draw_event
  set bowl_id = null,
      source_bowl_movie_id = null
  where draw_event.bowl_id = p_bowl_id
    or exists (
      select 1
      from public.bowl_movies movie
      where movie.id = draw_event.source_bowl_movie_id
        and movie.bowl_id = p_bowl_id
    );

  -- Pending legacy queue rows can otherwise be promoted by the bowl_movies
  -- delete trigger while the parent bowl is being removed.
  delete from public.bowl_movie_queue
  where bowl_id = p_bowl_id;

  -- Foreign keys cascade bowl-owned rows. Durable draw and watch-history rows
  -- use ON DELETE SET NULL and intentionally survive.
  delete from public.bowls
  where id = p_bowl_id;

  return p_bowl_id;
end;
$$;

revoke all on function public.delete_owned_bowl(uuid)
from public, anon, authenticated;

grant execute on function public.delete_owned_bowl(uuid)
to authenticated;

comment on function public.delete_owned_bowl(uuid) is
  'Atomically deletes a bowl owned by the authenticated user while preserving durable draw and personal watch history.';

commit;

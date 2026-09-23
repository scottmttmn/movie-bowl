-- A bowl owner can take a draw out of the bowl's watched history.
--
-- Returning is a two-hour undo, so a pick nobody watched but nobody caught in
-- time stayed in the bowl's list with no way to correct it. Correcting that
-- record is a different job from putting the title back: by then the movie may
-- have been drawn again or removed, so this neither restores a slip nor needs
-- one.
--
-- The draw is hidden, not deleted. `removed_at` takes it off every watched
-- list while the fact of the draw stays, the same way `returned_at` does, so
-- rotation still counts it: the contributor's turn was spent whether or not the
-- room watched the pick.
--
-- Personal history is deliberately untouched. Each participant's
-- user_watch_events row belongs to them, and deleting other people's history
-- after the undo window is exactly what the window exists to prevent. Anyone
-- who also did not watch it removes their own entry.
--
-- The client offers this on the web only. A television is shared by whoever is
-- holding the remote but is usually signed in as the owner, so the database
-- cannot tell the two apart; keeping the control off the television is the
-- product rule, and owner-only is the one this function enforces.

begin;

alter table public.bowl_draw_events
  add column removed_at timestamptz,
  add column removed_by uuid references public.profiles(id) on delete set null;

create or replace function public.remove_bowl_draw_from_history(p_draw_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_event public.bowl_draw_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change a bowl''s watched history.'
      using errcode = '42501';
  end if;

  select *
  into v_draw_event
  from public.bowl_draw_events
  where id = p_draw_event_id
  for update;

  if not found then
    raise exception 'This draw is no longer in the bowl''s watched history.'
      using errcode = 'P0001';
  end if;

  if v_draw_event.bowl_id is null or not exists (
    select 1
    from public.bowls bowl
    where bowl.id = v_draw_event.bowl_id
      and bowl.owner_id = auth.uid()
  ) then
    raise exception 'Only the bowl owner can remove a movie from its watched history.'
      using errcode = '42501';
  end if;

  -- A retry after a timeout lands here; the removal it was retrying stands.
  if v_draw_event.removed_at is not null then
    return;
  end if;

  if v_draw_event.returned_at is not null then
    raise exception 'This draw is no longer in the bowl''s watched history.'
      using errcode = 'P0001';
  end if;

  update public.bowl_draw_events
  set removed_at = now(),
      removed_by = auth.uid()
  where id = v_draw_event.id;
end;
$$;

revoke all on function public.remove_bowl_draw_from_history(uuid) from public, anon;
grant execute on function public.remove_bowl_draw_from_history(uuid) to authenticated;

-- A removed draw has left the watched history, so it can no longer be put
-- back from there either. Otherwise unchanged from 20260903120000.
create or replace function public.return_bowl_draw_to_bowl(p_draw_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_event public.bowl_draw_events%rowtype;
  v_new_bowl_movie_id uuid;
  v_active_movie_count integer;
  v_returned_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to move a movie to a bowl.'
      using errcode = '42501';
  end if;

  select *
  into v_draw_event
  from public.bowl_draw_events
  where id = p_draw_event_id
  for update;

  if not found
    or v_draw_event.returned_at is not null
    or v_draw_event.removed_at is not null then
    raise exception 'This draw is no longer available to move to the bowl.'
      using errcode = 'P0001';
  end if;

  if v_draw_event.bowl_id is null or not public.can_draw_from_bowl(v_draw_event.bowl_id) then
    raise exception 'You do not have permission to move this movie to the bowl.'
      using errcode = '42501';
  end if;

  -- The client disables the action once the window closes; this is the check
  -- that actually holds, for an older client or a direct call.
  if v_returned_at > v_draw_event.drawn_at + interval '2 hours' then
    raise exception 'This draw is too old to move back to the bowl. Add the movie again instead.'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_active_movie_count
  from public.bowl_movies
  where bowl_id = v_draw_event.bowl_id
    and drawn_at is null;

  if v_active_movie_count >= 500 then
    raise exception 'Bowl is at the undrawn movie limit (500).'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.bowl_movies (
      bowl_id,
      added_by,
      tmdb_id,
      title,
      poster_path,
      release_date,
      runtime,
      genres,
      overview,
      snapshot_at,
      added_by_name,
      note
    )
    values (
      v_draw_event.bowl_id,
      v_draw_event.added_by,
      v_draw_event.tmdb_id,
      v_draw_event.title,
      v_draw_event.poster_path,
      v_draw_event.release_date,
      v_draw_event.runtime,
      v_draw_event.genres,
      v_draw_event.overview,
      coalesce(v_draw_event.snapshot_at, v_returned_at),
      v_draw_event.added_by_name,
      v_draw_event.note
    )
    returning id into v_new_bowl_movie_id;
  exception
    when unique_violation then
      raise exception 'This movie is already in the bowl.'
        using errcode = '23505', constraint = 'bowl_active_tmdb_movies_pkey';
  end;

  update public.bowl_draw_events
  set returned_at = v_returned_at,
      returned_by = auth.uid()
  where id = v_draw_event.id;

  -- Every return that reaches here is inside the window, so it is an undo and
  -- the personal rows this draw generated go with it.
  delete from public.user_watch_events
  where source_draw_event_id = v_draw_event.id
    and source_kind = 'bowl_draw';

  return v_new_bowl_movie_id;
end;
$$;

commit;

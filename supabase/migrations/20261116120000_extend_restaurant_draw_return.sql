begin;

-- People draw a restaurant on Wednesday for Saturday, and plans change before
-- Saturday comes. The two-hour undo was sized for a movie night, where the
-- draw and the watching are the same evening. A restaurant drawn for a day
-- can be put back until that day ends.
--
-- The deadline lives on the draw event and is set once, by whoever drew,
-- right after the draw. The draw functions themselves are untouched: they are
-- the most sensitive code here, and a failed call to set the deadline leaves
-- an ordinary two-hour draw rather than a failed one.
alter table public.bowl_draw_events
  add column return_until timestamptz;

comment on column public.bowl_draw_events.return_until is
  'When set, a restaurant draw may be returned until this time rather than for two hours. Written only by set_bowl_draw_return_window.';

-- Sets the return deadline of the draw that took p_bowl_movie_id out of a
-- restaurant bowl. Only the person who drew may set it, only once, only while
-- the ordinary two-hour window is still open, and never past seven days from
-- the draw, which is as far ahead as the Open filter can pick a day. Answers
-- the deadline now in force, or null when nothing changed.
create function public.set_bowl_draw_return_window(
  p_bowl_movie_id uuid,
  p_until timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw_event public.bowl_draw_events%rowtype;
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to plan a draw.'
      using errcode = '42501';
  end if;

  select e.*
  into v_draw_event
  from public.bowl_draw_events e
  join public.bowls b on b.id = e.bowl_id
  where e.source_bowl_movie_id = p_bowl_movie_id
    and e.drawn_by = auth.uid()
    and e.returned_at is null
    and e.removed_at is null
    and b.kind = 'restaurants'
  for update of e;

  if not found
    or p_until is null
    or v_draw_event.return_until is not null
    or now() > v_draw_event.drawn_at + interval '2 hours' then
    return null;
  end if;

  v_until := least(p_until, v_draw_event.drawn_at + interval '7 days');
  if v_until <= v_draw_event.drawn_at + interval '2 hours' then
    return null;
  end if;

  update public.bowl_draw_events
  set return_until = v_until
  where id = v_draw_event.id;

  return v_until;
end;
$$;

revoke all on function public.set_bowl_draw_return_window(uuid, timestamptz) from public, anon;
grant execute on function public.set_bowl_draw_return_window(uuid, timestamptz) to authenticated;

comment on function public.set_bowl_draw_return_window(uuid, timestamptz) is
  'Lets the person who just drew a restaurant keep the draw returnable until the end of the day it was drawn for.';

-- The same function as before with one change: the window check reads
-- return_until.
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
  v_restores_slip boolean;
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
  -- that actually holds, for an older client or a direct call. A restaurant
  -- drawn ahead for a day carries a later deadline in return_until.
  if v_returned_at > greatest(
    v_draw_event.drawn_at + interval '2 hours',
    coalesce(v_draw_event.return_until, v_draw_event.drawn_at)
  ) then
    raise exception 'This draw is too old to move back to the bowl. Add the movie again instead.'
      using errcode = 'P0001';
  end if;

  -- Locks the bowl as install and removal do, so the pack cannot be removed
  -- between this check and the insert.
  select v_draw_event.starter_pack is null
    or bowl.starter_pack is not distinct from v_draw_event.starter_pack
  into v_restores_slip
  from public.bowls bowl
  where bowl.id = v_draw_event.bowl_id
  for update;

  if v_restores_slip then
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
        starter_pack,
        note,
        cuisine,
        place_id
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
        v_draw_event.starter_pack,
        v_draw_event.note,
        v_draw_event.cuisine,
        v_draw_event.place_id
      )
      returning id into v_new_bowl_movie_id;
    exception
      when unique_violation then
        raise exception 'This movie is already in the bowl.'
          using errcode = '23505', constraint = 'bowl_active_tmdb_movies_pkey';
    end;
  end if;

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

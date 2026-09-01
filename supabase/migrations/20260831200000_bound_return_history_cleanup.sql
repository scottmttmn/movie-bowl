-- Keep the useful group undo for a recent draw without allowing a later return
-- to erase every participant's durable personal history.

begin;

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

  if not found or v_draw_event.returned_at is not null then
    raise exception 'This draw is no longer available to move to the bowl.'
      using errcode = 'P0001';
  end if;

  if v_draw_event.bowl_id is null or not public.can_draw_from_bowl(v_draw_event.bowl_id) then
    raise exception 'You do not have permission to move this movie to the bowl.'
      using errcode = '42501';
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

  if v_returned_at <= v_draw_event.drawn_at + interval '2 hours' then
    delete from public.user_watch_events
    where source_draw_event_id = v_draw_event.id
      and source_kind = 'bowl_draw';
  end if;

  return v_new_bowl_movie_id;
end;
$$;

revoke all on function public.return_bowl_draw_to_bowl(uuid)
from public, anon;

grant execute on function public.return_bowl_draw_to_bowl(uuid)
to authenticated;

comment on function public.return_bowl_draw_to_bowl(uuid) is
  'Returns a draw to its bowl and removes generated personal history only during the two-hour group undo window.';

commit;

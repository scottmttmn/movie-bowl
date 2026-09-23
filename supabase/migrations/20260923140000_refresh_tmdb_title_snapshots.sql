-- TMDB's API terms forbid caching any information obtained from it for longer
-- than six months (§1.C). Every add and draw copies TMDB's details beside the
-- slip or the history entry, so those copies need the same rule the filter
-- cache already follows: refreshed inside the window, cleared past it.
--
-- The daily cron does the refreshing. Titles still in a bowl are refreshed
-- from the fetch the filter refresh already makes; titles that only survive in
-- history get a small pass of their own. One fetch per distinct TMDB id updates
-- every row holding it, so the work follows distinct titles, not rows.
--
-- What is refreshed differs by table. A slip, a draw event and a removed solo
-- copy take all six TMDB fields. A personal history entry takes only the four
-- descriptive ones: its title and release date are the person's own record,
-- editable through update_user_watch_event, and a refresh must never overwrite
-- an edit. Custom titles carry negative ids, are written by people rather than
-- taken from TMDB, and are never touched.
--
-- Whatever is not refreshed in time is cleared rather than kept: poster,
-- overview, runtime and genres go to null and the title stays, so the row is
-- still listed and drawable. Every surface already renders a row without a
-- poster, because custom titles have never had one.

begin;

-- History rows had no freshness stamp. Their details were copied when the row
-- was written, so that is the honest backfill.
alter table public.user_watch_events
  add column snapshot_at timestamptz;

update public.user_watch_events
set snapshot_at = created_at
where snapshot_at is null;

alter table public.user_watch_events
  alter column snapshot_at set default now();

create index if not exists bowl_draw_events_tmdb_id_idx
  on public.bowl_draw_events (tmdb_id);
create index if not exists user_watch_events_tmdb_id_idx
  on public.user_watch_events (tmdb_id);
create index if not exists solo_draw_removed_copies_tmdb_id_idx
  on public.solo_draw_removed_copies (tmdb_id);

-- Clears what has aged out, then names the titles due for a refresh, oldest
-- copy first. A cleared row keeps its old snapshot_at on purpose, so it stays
-- at the front of the queue until a refresh succeeds.
create or replace function public.select_tmdb_title_snapshot_refreshes(
  p_limit integer,
  p_stale_before timestamptz
)
returns table (tmdb_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_before timestamptz := now() - interval '6 months';
begin
  update public.bowl_movies row_
  set poster_path = null, overview = null, runtime = null, genres = '{}'
  where row_.tmdb_id > 0
    and coalesce(row_.snapshot_at, '-infinity') < v_expired_before
    and (row_.poster_path is not null or row_.overview is not null
      or row_.runtime is not null or row_.genres <> '{}');

  update public.bowl_draw_events row_
  set poster_path = null, overview = null, runtime = null, genres = '{}'
  where row_.tmdb_id > 0
    and coalesce(row_.snapshot_at, '-infinity') < v_expired_before
    and (row_.poster_path is not null or row_.overview is not null
      or row_.runtime is not null or row_.genres <> '{}');

  update public.user_watch_events row_
  set poster_path = null, overview = null, runtime = null, genres = '{}'
  where row_.tmdb_id > 0
    and coalesce(row_.snapshot_at, '-infinity') < v_expired_before
    and (row_.poster_path is not null or row_.overview is not null
      or row_.runtime is not null or row_.genres <> '{}');

  update public.solo_draw_removed_copies row_
  set poster_path = null, overview = null, runtime = null, genres = '{}'
  where row_.tmdb_id > 0
    and coalesce(row_.snapshot_at, '-infinity') < v_expired_before
    and (row_.poster_path is not null or row_.overview is not null
      or row_.runtime is not null or row_.genres <> '{}');

  -- The legacy queue is no longer written, so it is only ever cleared; spending
  -- the refresh budget on it would be spending it on rows nobody can see.
  update public.bowl_movie_queue row_
  set poster_path = null, overview = null, runtime = null, genres = '{}'
  where row_.tmdb_id > 0
    and coalesce(row_.snapshot_at, '-infinity') < v_expired_before
    and (row_.poster_path is not null or row_.overview is not null
      or row_.runtime is not null or row_.genres <> '{}');

  return query
  with snapshots as (
    select movie.tmdb_id, movie.snapshot_at from public.bowl_movies movie
    union all
    select event.tmdb_id, event.snapshot_at from public.bowl_draw_events event
    union all
    select history.tmdb_id, history.snapshot_at from public.user_watch_events history
    union all
    select copy.tmdb_id, copy.snapshot_at from public.solo_draw_removed_copies copy
  )
  select snapshots.tmdb_id
  from snapshots
  where snapshots.tmdb_id > 0
  group by snapshots.tmdb_id
  having min(coalesce(snapshots.snapshot_at, '-infinity')) < p_stale_before
  order by min(coalesce(snapshots.snapshot_at, '-infinity')) asc, snapshots.tmdb_id
  limit greatest(0, coalesce(p_limit, 0));
end;
$$;

-- Writes one fresh fetch onto every row holding the title. A title TMDB no
-- longer has (p_found false) is cleared the same way an expired one is, and
-- stamped, so it is not fetched again every day.
create or replace function public.apply_tmdb_title_snapshot(
  p_tmdb_id bigint,
  p_found boolean,
  p_title text default null,
  p_poster_path text default null,
  p_release_date date default null,
  p_runtime integer default null,
  p_genres text[] default '{}',
  p_overview text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_found boolean := coalesce(p_found, false);
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_genres text[] := case when v_found then coalesce(p_genres, '{}') else '{}' end;
  v_poster_path text := case when v_found then p_poster_path end;
  v_runtime integer := case when v_found and p_runtime > 0 then p_runtime end;
  v_overview text := case when v_found then p_overview end;
  v_rows integer := 0;
  v_count integer;
begin
  if p_tmdb_id is null or p_tmdb_id <= 0 then
    raise exception 'Only TMDB titles can be refreshed.'
      using errcode = '22023';
  end if;

  update public.bowl_movies row_
  set title = case when v_found and v_title is not null then v_title else row_.title end,
      release_date = case when v_found then p_release_date else row_.release_date end,
      poster_path = v_poster_path, runtime = v_runtime, genres = v_genres,
      overview = v_overview, snapshot_at = v_now
  where row_.tmdb_id = p_tmdb_id;
  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;

  update public.bowl_draw_events row_
  set title = case when v_found and v_title is not null then v_title else row_.title end,
      release_date = case when v_found then p_release_date else row_.release_date end,
      poster_path = v_poster_path, runtime = v_runtime, genres = v_genres,
      overview = v_overview, snapshot_at = v_now
  where row_.tmdb_id = p_tmdb_id;
  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;

  update public.solo_draw_removed_copies row_
  set title = case when v_found and v_title is not null then v_title else row_.title end,
      release_date = case when v_found then p_release_date else row_.release_date end,
      poster_path = v_poster_path, runtime = v_runtime, genres = v_genres,
      overview = v_overview, snapshot_at = v_now
  where row_.tmdb_id = p_tmdb_id;
  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;

  -- Title and release date are the person's own record here; see the header.
  update public.user_watch_events row_
  set poster_path = v_poster_path, runtime = v_runtime, genres = v_genres,
      overview = v_overview, snapshot_at = v_now
  where row_.tmdb_id = p_tmdb_id;
  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;

  return v_rows;
end;
$$;

revoke all on function public.select_tmdb_title_snapshot_refreshes(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.select_tmdb_title_snapshot_refreshes(integer, timestamptz)
  to service_role;

revoke all on function public.apply_tmdb_title_snapshot(
  bigint, boolean, text, text, date, integer, text[], text
) from public, anon, authenticated;
grant execute on function public.apply_tmdb_title_snapshot(
  bigint, boolean, text, text, date, integer, text[], text
) to service_role;

commit;

-- Revert starter packs. Move this file into supabase/migrations/ with a fresh
-- timestamp to run it. Undrawn pack slips are deleted first -- without their
-- marker they would read as a link guest named after the pack -- and drawn
-- ones stay in history under the pack's name, as any draw does. Every draw
-- function returns to its pre-pack definition, taken verbatim from the
-- migration that last defined it.

begin;

delete from public.bowl_movies
where starter_pack is not null
  and drawn_at is null;

drop function if exists public.install_bowl_starter_pack(uuid, text, text, jsonb);
drop function if exists public.remove_bowl_starter_pack(uuid);
drop function if exists public.claim_bowl_starter_pack_movie(uuid, bigint, text);
drop function if exists public.draw_bowl_movie(uuid, text, text);

-- From 20260823120000_use_local_watch_dates.sql.
create or replace function public.draw_bowl_movie(
  p_bowl_movie_id uuid,
  p_watched_timezone text
)
returns table (
  draw_event_id uuid,
  drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bowl_id uuid;
  v_draw_method text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

  select movie.bowl_id
  into v_bowl_id
  from public.bowl_movies movie
  where movie.id = p_bowl_movie_id;

  if not found then
    raise exception 'This movie is no longer available to draw.'
      using errcode = 'P0001';
  end if;

  select bowl.draw_method
  into v_draw_method
  from public.bowls bowl
  where bowl.id = v_bowl_id
  for update;

  if not found then
    raise exception 'This bowl is no longer available.'
      using errcode = 'P0001';
  end if;

  if v_draw_method = 'rotation' then
    raise exception 'This bowl now uses rotation. Refresh Movie Bowl and try again.'
      using errcode = 'P0001';
  end if;

  return query
  select recorded.draw_event_id, recorded.drawn_at
  from public._record_bowl_movie_draw(
    p_bowl_movie_id,
    p_watched_timezone
  ) recorded;
end;
$$;

-- From 20260829170000_add_pinned_bowl_movies.sql. It replaces the wrapper, so
-- the three-argument helper it called can go.
create or replace function public._record_bowl_movie_draw(
  p_bowl_movie_id uuid,
  p_watched_timezone text
)
returns table (
  draw_event_id uuid,
  drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie public.bowl_movies%rowtype;
  v_bowl_name text;
  v_draw_event_id uuid;
  v_drawn_at timestamptz := now();
  v_watched_timezone text := coalesce(nullif(btrim(p_watched_timezone), ''), 'UTC');
  v_watched_on date;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_info
    where timezone_info.name = v_watched_timezone
  ) then
    raise exception 'The watched timezone is not recognized.'
      using errcode = '22023';
  end if;

  v_watched_on := (v_drawn_at at time zone v_watched_timezone)::date;

  select *
  into v_movie
  from public.bowl_movies
  where id = p_bowl_movie_id
  for update;

  if not found or v_movie.drawn_at is not null then
    raise exception 'This movie is no longer available to draw.'
      using errcode = 'P0001';
  end if;

  if not public.can_draw_from_bowl(v_movie.bowl_id) then
    raise exception 'You do not have permission to draw in this bowl.'
      using errcode = '42501';
  end if;

  select name
  into v_bowl_name
  from public.bowls
  where id = v_movie.bowl_id;

  if v_bowl_name is null then
    raise exception 'This bowl is no longer available.'
      using errcode = 'P0001';
  end if;

  update public.bowl_movies
  set drawn_at = v_drawn_at,
      drawn_by = auth.uid(),
      is_pinned = false
  where id = v_movie.id;

  insert into public.bowl_draw_events (
    bowl_id,
    source_bowl_movie_id,
    bowl_name,
    added_by,
    added_by_name,
    drawn_by,
    tmdb_id,
    title,
    poster_path,
    release_date,
    runtime,
    genres,
    overview,
    snapshot_at,
    drawn_at,
    note
  )
  values (
    v_movie.bowl_id,
    v_movie.id,
    v_bowl_name,
    v_movie.added_by,
    v_movie.added_by_name,
    auth.uid(),
    v_movie.tmdb_id,
    v_movie.title,
    v_movie.poster_path,
    v_movie.release_date,
    v_movie.runtime,
    coalesce(v_movie.genres, '{}'),
    v_movie.overview,
    v_movie.snapshot_at,
    v_drawn_at,
    v_movie.note
  )
  returning id into v_draw_event_id;

  insert into public.user_watch_events (
    user_id,
    source_draw_event_id,
    source_kind,
    bowl_name,
    tmdb_id,
    title,
    poster_path,
    release_date,
    runtime,
    genres,
    overview,
    watched_on,
    note
  )
  select
    participant.user_id,
    v_draw_event_id,
    'bowl_draw',
    v_bowl_name,
    v_movie.tmdb_id,
    v_movie.title,
    v_movie.poster_path,
    v_movie.release_date,
    v_movie.runtime,
    coalesce(v_movie.genres, '{}'),
    v_movie.overview,
    v_watched_on,
    v_movie.note
  from (
    select b.owner_id as user_id
    from public.bowls b
    where b.id = v_movie.bowl_id
    union
    select member.user_id
    from public.bowl_members member
    where member.bowl_id = v_movie.bowl_id
  ) participant
  where participant.user_id is not null
  on conflict (user_id, source_draw_event_id) do nothing;

  return query select v_draw_event_id, v_drawn_at;
end;
$$;

drop function if exists public._record_bowl_movie_draw(uuid, text, text);

-- From 20260829170000_add_pinned_bowl_movies.sql.
create or replace function public.draw_bowl_movie_by_rotation(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[],
  p_watched_timezone text
)
returns table (
  bowl_movie_id uuid,
  draw_event_id uuid,
  drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_method text;
  v_selected_movie_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

  if coalesce(cardinality(p_candidate_movie_ids), 0) = 0 then
    raise exception 'No eligible movies are available for this rotation draw.'
      using errcode = 'P0001';
  end if;

  if cardinality(p_candidate_movie_ids) > 500 then
    raise exception 'Too many candidate movies were supplied.'
      using errcode = 'P0001';
  end if;

  select bowl.draw_method
  into v_draw_method
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found then
    raise exception 'This bowl is no longer available.'
      using errcode = 'P0001';
  end if;

  if not public.can_draw_from_bowl(p_bowl_id) then
    raise exception 'You do not have permission to draw in this bowl.'
      using errcode = '42501';
  end if;

  if v_draw_method <> 'rotation' then
    raise exception 'This bowl is not using rotation.'
      using errcode = 'P0001';
  end if;

  with candidate_movies as (
    select
      movie.id,
      movie.is_pinned,
      case
        when movie.added_by is not null
          then 'user:' || movie.added_by::text
        when nullif(btrim(coalesce(movie.added_by_name, '')), '') is not null
          then 'guest:' || lower(btrim(movie.added_by_name))
        else 'guest:Link Guest'
      end as bucket_key
    from public.bowl_movies movie
    where movie.bowl_id = p_bowl_id
      and movie.drawn_at is null
      and movie.id = any(p_candidate_movie_ids)
  ),
  candidate_buckets as (
    select distinct candidate.bucket_key
    from candidate_movies candidate
  ),
  history_by_bucket as (
    select
      case
        when event.added_by is not null
          then 'user:' || event.added_by::text
        when nullif(btrim(coalesce(event.added_by_name, '')), '') is not null
          then 'guest:' || lower(btrim(event.added_by_name))
        else 'guest:Link Guest'
      end as bucket_key,
      max(event.drawn_at) as last_drawn_at
    from public.bowl_draw_events event
    where event.bowl_id = p_bowl_id
    group by 1
  ),
  selected_bucket as (
    select candidate.bucket_key
    from candidate_buckets candidate
    left join history_by_bucket history using (bucket_key)
    order by history.last_drawn_at asc nulls first, random()
    limit 1
  )
  select candidate.id
  into v_selected_movie_id
  from candidate_movies candidate
  join selected_bucket selected using (bucket_key)
  order by candidate.is_pinned desc, random()
  limit 1;

  if v_selected_movie_id is null then
    raise exception 'The eligible rotation pool is stale. Please try again.'
      using errcode = 'P0001';
  end if;

  return query
  select
    v_selected_movie_id,
    recorded.draw_event_id,
    recorded.drawn_at
  from public._record_bowl_movie_draw(
    v_selected_movie_id,
    p_watched_timezone
  ) recorded;
end;
$$;

-- From 20260923120000_let_owners_remove_watched_draws.sql.
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

drop function if exists public._bowl_contributor_bucket_key(uuid, text, text);
drop function if exists public._starter_pack_movie_row(jsonb);

alter table public.bowl_draw_events
  drop column if exists turn_bucket_key,
  drop column if exists starter_pack;

alter table public.bowl_movies
  drop constraint if exists bowl_movies_starter_pack_shape_check,
  drop constraint if exists bowl_movies_starter_pack_slug_check,
  drop column if exists starter_pack;

alter table public.bowls
  drop constraint if exists bowls_starter_pack_installed_at_check,
  drop constraint if exists bowls_starter_pack_slug_check,
  drop column if exists starter_pack_installed_at,
  drop column if exists starter_pack;

revoke all on function public._record_bowl_movie_draw(uuid, text)
from public, anon, authenticated;
revoke all on function public.draw_bowl_movie(uuid, text)
from public, anon, authenticated;
revoke all on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
from public, anon, authenticated;
revoke all on function public.return_bowl_draw_to_bowl(uuid)
from public, anon, authenticated;

grant execute on function public.draw_bowl_movie(uuid, text)
to authenticated;
grant execute on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
to authenticated;
grant execute on function public.return_bowl_draw_to_bowl(uuid)
to authenticated;

comment on function public._record_bowl_movie_draw(uuid, text) is
  'Private persistence helper that clears pins and derives automatic watch dates in a validated IANA timezone.';
comment on function public.draw_bowl_movie(uuid, text) is
  'Records an ordinary draw and derives its automatic watch date in the drawing device timezone.';
comment on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text) is
  'Atomically selects and records a rotation draw, preferring the selected contributor pin.';

commit;

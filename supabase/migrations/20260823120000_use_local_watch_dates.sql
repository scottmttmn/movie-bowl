begin;

-- Keep the existing one-argument draw RPCs available for older clients, but
-- route new clients through overloads that provide the drawing device's IANA
-- timezone. The exact draw instant remains server-authored.
create function public._record_bowl_movie_draw(
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
      drawn_by = auth.uid()
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

create or replace function public._record_bowl_movie_draw(p_bowl_movie_id uuid)
returns table (
  draw_event_id uuid,
  drawn_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select recorded.draw_event_id, recorded.drawn_at
  from public._record_bowl_movie_draw(p_bowl_movie_id, 'UTC') recorded;
$$;

create function public.draw_bowl_movie(
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

create function public.draw_bowl_movie_by_rotation(
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
  order by random()
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

revoke all on function public._record_bowl_movie_draw(uuid, text)
from public, anon, authenticated;

revoke all on function public._record_bowl_movie_draw(uuid)
from public, anon, authenticated;

revoke all on function public.draw_bowl_movie(uuid, text)
from public, anon, authenticated;

revoke all on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
from public, anon, authenticated;

grant execute on function public.draw_bowl_movie(uuid, text)
to authenticated;

grant execute on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
to authenticated;

comment on function public._record_bowl_movie_draw(uuid, text) is
  'Private persistence helper that derives automatic watch dates in a validated IANA timezone.';

comment on function public._record_bowl_movie_draw(uuid) is
  'Legacy private draw helper that preserves UTC watch-date behavior for older RPCs.';

comment on function public.draw_bowl_movie(uuid, text) is
  'Records an ordinary draw and derives its automatic watch date in the drawing device timezone.';

comment on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text) is
  'Atomically selects and records a rotation draw with a device-local automatic watch date.';

commit;

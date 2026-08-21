-- Add contributor rotation as an atomic draw method. The client resolves the
-- exact eligible movie ids; the database chooses the contributor who has waited
-- longest and records the draw in the same transaction.

begin;

alter table public.bowls
  drop constraint if exists bowls_draw_method_check;

alter table public.bowls
  add constraint bowls_draw_method_check
  check (draw_method in ('person_first', 'title_first', 'rotation'));

create index if not exists bowl_draw_events_bowl_drawn_at_idx
  on public.bowl_draw_events (bowl_id, drawn_at desc);

create or replace function public.save_bowl_draw_method(
  p_bowl_id uuid,
  p_method text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to update the draw method.'
      using errcode = '42501';
  end if;

  select bowl.owner_id
  into v_owner_id
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can update the draw method.'
      using errcode = '42501';
  end if;

  if p_method is null
    or p_method not in ('person_first', 'title_first', 'rotation')
  then
    raise exception 'Invalid draw method.'
      using errcode = 'P0001';
  end if;

  update public.bowls
  set draw_method = p_method
  where id = p_bowl_id;

  return p_method;
end;
$$;

-- This helper is deliberately not executable by app roles. Both public draw
-- functions call it so event and participant-history persistence cannot drift.
create or replace function public._record_bowl_movie_draw(p_bowl_movie_id uuid)
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

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
    drawn_at
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
    v_drawn_at
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
    watched_on
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
    (v_drawn_at at time zone 'utc')::date
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

create or replace function public.draw_bowl_movie(p_bowl_movie_id uuid)
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

  -- Every draw path takes the bowl lock first. This serializes rotation draws
  -- with ordinary/older clients and prevents a method change mid-draw.
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
  from public._record_bowl_movie_draw(p_bowl_movie_id) recorded;
end;
$$;

create or replace function public.draw_bowl_movie_by_rotation(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[]
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
  from public._record_bowl_movie_draw(v_selected_movie_id) recorded;
end;
$$;

revoke all on function public._record_bowl_movie_draw(uuid)
from public, anon, authenticated;

revoke all on function public.draw_bowl_movie_by_rotation(uuid, uuid[])
from public, anon, authenticated;

grant execute on function public.draw_bowl_movie_by_rotation(uuid, uuid[])
to authenticated;

comment on function public.draw_bowl_movie_by_rotation(uuid, uuid[]) is
  'Atomically selects and records a rotation draw from client-resolved eligible movie ids.';

comment on function public._record_bowl_movie_draw(uuid) is
  'Private persistence helper shared by public bowl draw RPCs.';

commit;

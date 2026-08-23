-- Restore the pre-comment RPCs before removing their dependent columns.
-- Move this file into migrations with a fresh timestamp before applying it.

begin;

drop function if exists public.update_own_bowl_movie_note(uuid, text);

create or replace function public.consume_bowl_add_link(
  p_token text,
  p_movie jsonb,
  p_contributor_name text default null
)
returns table (
  bowl_id uuid,
  bowl_name text,
  remaining_adds integer,
  link_id uuid,
  movie_id uuid,
  added_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.bowl_add_links%rowtype;
  v_movie_id uuid;
  v_title text;
  v_tmdb_id bigint;
  v_runtime integer;
  v_release_date date;
  v_poster_path text;
  v_overview text;
  v_genres text[];
  v_snapshot_at timestamptz;
  v_bowl_name text;
  v_resolved_contributor_name text;
begin
  select *
  into v_link
  from public.bowl_add_links
  where token = p_token
    and revoked_at is null
  for update;

  if not found then
    raise exception 'Add link not found'
      using errcode = 'P0001';
  end if;

  if v_link.adds_used >= v_link.max_adds then
    raise exception 'Add link is exhausted'
      using errcode = 'P0001';
  end if;

  v_title := nullif(trim(coalesce(p_movie->>'title', '')), '');
  if v_title is null then
    raise exception 'Movie title is required'
      using errcode = 'P0001';
  end if;

  begin
    v_tmdb_id := nullif(trim(coalesce(p_movie->>'tmdb_id', p_movie->>'id', '')), '')::bigint;
  exception
    when invalid_text_representation then
      v_tmdb_id := null;
  end;

  if v_tmdb_id is null then
    v_tmdb_id := -1 * floor(random() * 2000000000 + 1)::bigint;
  end if;

  v_runtime := nullif(trim(coalesce(p_movie->>'runtime', '')), '')::integer;
  v_release_date := nullif(trim(coalesce(p_movie->>'release_date', '')), '')::date;
  v_poster_path := nullif(trim(coalesce(p_movie->>'poster_path', '')), '');
  v_overview := nullif(trim(coalesce(p_movie->>'overview', '')), '');
  v_snapshot_at := coalesce(nullif(trim(coalesce(p_movie->>'snapshot_at', '')), '')::timestamptz, now());
  v_resolved_contributor_name := coalesce(
    nullif(trim(coalesce(p_contributor_name, '')), ''),
    nullif(trim(coalesce(v_link.default_contributor_name, '')), ''),
    'Link Guest'
  );

  if jsonb_typeof(p_movie->'genres') = 'array' then
    select coalesce(array_agg(value), '{}')
    into v_genres
    from jsonb_array_elements_text(p_movie->'genres') as t(value);
  else
    v_genres := '{}';
  end if;

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
    added_via_link_id,
    added_by_name
  ) values (
    v_link.bowl_id,
    v_link.created_by,
    v_tmdb_id,
    v_title,
    v_poster_path,
    v_release_date,
    v_runtime,
    v_genres,
    v_overview,
    v_snapshot_at,
    v_link.id,
    v_resolved_contributor_name
  )
  returning id into v_movie_id;

  if v_link.adds_used + 1 >= v_link.max_adds then
    delete from public.bowl_add_links
    where id = v_link.id;
    remaining_adds := 0;
  else
    update public.bowl_add_links
    set adds_used = adds_used + 1,
        updated_at = now()
    where id = v_link.id
    returning max_adds - adds_used into remaining_adds;
  end if;

  select b.name
  into v_bowl_name
  from public.bowls b
  where b.id = v_link.bowl_id;

  bowl_id := v_link.bowl_id;
  bowl_name := coalesce(v_bowl_name, 'Movie Bowl');
  link_id := v_link.id;
  movie_id := v_movie_id;
  added_by_name := v_resolved_contributor_name;
  return next;
end;
$$;

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

  select * into v_movie
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

  select name into v_bowl_name
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
    bowl_id, source_bowl_movie_id, bowl_name, added_by, added_by_name,
    drawn_by, tmdb_id, title, poster_path, release_date, runtime, genres,
    overview, snapshot_at, drawn_at
  ) values (
    v_movie.bowl_id, v_movie.id, v_bowl_name, v_movie.added_by,
    v_movie.added_by_name, auth.uid(), v_movie.tmdb_id, v_movie.title,
    v_movie.poster_path, v_movie.release_date, v_movie.runtime,
    coalesce(v_movie.genres, '{}'), v_movie.overview, v_movie.snapshot_at,
    v_drawn_at
  ) returning id into v_draw_event_id;

  insert into public.user_watch_events (
    user_id, source_draw_event_id, source_kind, bowl_name, tmdb_id, title,
    poster_path, release_date, runtime, genres, overview, watched_on
  )
  select
    participant.user_id, v_draw_event_id, 'bowl_draw', v_bowl_name,
    v_movie.tmdb_id, v_movie.title, v_movie.poster_path, v_movie.release_date,
    v_movie.runtime, coalesce(v_movie.genres, '{}'), v_movie.overview,
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
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to move a movie to a bowl.'
      using errcode = '42501';
  end if;

  select * into v_draw_event
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

  select count(*)::integer into v_active_movie_count
  from public.bowl_movies
  where bowl_id = v_draw_event.bowl_id
    and drawn_at is null;

  if v_active_movie_count >= 500 then
    raise exception 'Bowl is at the undrawn movie limit (500).'
      using errcode = 'P0001';
  end if;

  begin
    insert into public.bowl_movies (
      bowl_id, added_by, tmdb_id, title, poster_path, release_date, runtime,
      genres, overview, snapshot_at, added_by_name
    ) values (
      v_draw_event.bowl_id, v_draw_event.added_by, v_draw_event.tmdb_id,
      v_draw_event.title, v_draw_event.poster_path, v_draw_event.release_date,
      v_draw_event.runtime, v_draw_event.genres, v_draw_event.overview,
      coalesce(v_draw_event.snapshot_at, now()), v_draw_event.added_by_name
    ) returning id into v_new_bowl_movie_id;
  exception
    when unique_violation then
      raise exception 'This movie is already in the bowl.'
        using errcode = '23505', constraint = 'bowl_active_tmdb_movies_pkey';
  end;

  update public.bowl_draw_events
  set returned_at = now(), returned_by = auth.uid()
  where id = v_draw_event.id;

  delete from public.user_watch_events
  where source_draw_event_id = v_draw_event.id
    and source_kind = 'bowl_draw';

  return v_new_bowl_movie_id;
end;
$$;

drop function if exists public.create_manual_watch_event(
  text, date, bigint, text, date, integer, text[], text, text
);

create function public.create_manual_watch_event(
  p_title text,
  p_watched_on date,
  p_tmdb_id bigint default null,
  p_poster_path text default null,
  p_release_date date default null,
  p_runtime integer default null,
  p_genres text[] default '{}',
  p_overview text default null
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to add watch history.'
      using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'A movie title is required.' using errcode = 'P0001';
  end if;
  if p_watched_on is null then
    raise exception 'A watched date is required.' using errcode = 'P0001';
  end if;

  insert into public.user_watch_events (
    user_id, source_kind, title, tmdb_id, poster_path, release_date, runtime,
    genres, overview, watched_on
  ) values (
    auth.uid(), 'manual', v_title, p_tmdb_id, p_poster_path, p_release_date,
    p_runtime, coalesce(p_genres, '{}'), p_overview, p_watched_on
  ) returning * into v_event;
  return v_event;
end;
$$;

drop function if exists public.update_user_watch_event(uuid, text, date, date, text);

create function public.update_user_watch_event(
  p_event_id uuid,
  p_title text,
  p_watched_on date,
  p_release_date date default null
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to edit watch history.'
      using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'A movie title is required.' using errcode = 'P0001';
  end if;
  if p_watched_on is null then
    raise exception 'A watched date is required.' using errcode = 'P0001';
  end if;

  update public.user_watch_events
  set title = v_title,
      watched_on = p_watched_on,
      release_date = p_release_date,
      updated_at = now()
  where id = p_event_id
    and user_id = auth.uid()
  returning * into v_event;

  if not found then
    raise exception 'This history entry is no longer available.' using errcode = 'P0001';
  end if;
  return v_event;
end;
$$;

revoke all on function public.consume_bowl_add_link(text, jsonb, text)
from public, anon, authenticated;
grant execute on function public.consume_bowl_add_link(text, jsonb, text)
to authenticated, anon, service_role;

revoke all on function public._record_bowl_movie_draw(uuid)
from public, anon, authenticated;

revoke all on function public.create_manual_watch_event(
  text, date, bigint, text, date, integer, text[], text
) from public, anon, authenticated;
grant execute on function public.create_manual_watch_event(
  text, date, bigint, text, date, integer, text[], text
) to authenticated;

revoke all on function public.update_user_watch_event(uuid, text, date, date)
from public, anon, authenticated;
grant execute on function public.update_user_watch_event(uuid, text, date, date)
to authenticated;

alter table public.user_watch_events drop column note;
alter table public.bowl_draw_events drop column note;
alter table public.bowl_movies drop column note;

commit;

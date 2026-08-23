-- Revert device-local automatic watch dates. Move this file into
-- supabase/migrations/ with a fresh timestamp to run it. Existing history rows
-- are left unchanged; older draw RPCs continue deriving dates in UTC.

begin;

drop function if exists public.draw_bowl_movie(uuid, text);
drop function if exists public.draw_bowl_movie_by_rotation(uuid, uuid[], text);

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
    (v_drawn_at at time zone 'UTC')::date,
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

drop function if exists public._record_bowl_movie_draw(uuid, text);

revoke all on function public._record_bowl_movie_draw(uuid)
from public, anon, authenticated;

comment on function public._record_bowl_movie_draw(uuid) is
  'Private persistence helper shared by public bowl draw RPCs.';

commit;

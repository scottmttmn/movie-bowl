-- Revert contributor rotation. Move this file into supabase/migrations/ with a
-- fresh timestamp to run it. Bowls using rotation are explicitly returned to
-- person-first before the constraint is narrowed.

begin;

update public.bowls
set draw_method = 'person_first'
where draw_method = 'rotation';

alter table public.bowls
  drop constraint if exists bowls_draw_method_check;

alter table public.bowls
  add constraint bowls_draw_method_check
  check (draw_method in ('person_first', 'title_first'));

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
    or p_method not in ('person_first', 'title_first')
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

drop function if exists public.draw_bowl_movie_by_rotation(uuid, uuid[]);

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
  where id = v_movie.bowl_id
  for key share;

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

drop function if exists public._record_bowl_movie_draw(uuid);

drop index if exists public.bowl_draw_events_bowl_drawn_at_idx;

commit;

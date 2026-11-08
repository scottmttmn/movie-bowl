-- Reverts 20261108120000_add_restaurant_bowls.sql. Revert the app first: the
-- client reads bowls.kind and restaurant_bowls_enabled, and sends the
-- three-argument create_owned_bowl. Restaurant bowls and their slips become
-- movie bowls holding custom titles; their cuisine and place ids are dropped.
-- Move into migrations/ with a fresh timestamp to run it.
begin;

drop trigger if exists match_bowl_movie_to_bowl_kind on public.bowl_movies;
drop function if exists public._match_bowl_movie_to_bowl_kind();
drop trigger if exists keep_bowl_kind on public.bowls;
drop function if exists public._keep_bowl_kind();

drop function if exists public.create_owned_bowl(uuid, text, text);

-- The two-argument form forwarded to the three-argument one; it gets its own
-- body back.
create or replace function public.create_owned_bowl(p_bowl_id uuid, p_name text)
returns public.bowls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_bowl public.bowls%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a bowl.'
      using errcode = '42501';
  end if;

  if p_bowl_id is null then
    raise exception 'A bowl id is required.'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'Bowl name is required.'
      using errcode = '22023';
  end if;

  -- The same lock the limit trigger takes, taken first: a duplicate submission
  -- racing this one waits here and then finds the committed bowl, instead of
  -- missing it and colliding on insert.
  perform pg_advisory_xact_lock(hashtextextended('owned_bowl_limit:' || v_user_id::text, 0));

  select *
  into v_bowl
  from public.bowls
  where id = p_bowl_id
    and owner_id = v_user_id;

  if v_bowl.id is null then
    insert into public.bowls (id, owner_id, name)
    values (p_bowl_id, v_user_id, v_name)
    on conflict (id) do nothing
    returning * into v_bowl;

    -- The id is taken by a bowl this caller does not own. A client-generated
    -- UUID only collides by replay, so say nothing about whose it is.
    if v_bowl.id is null then
      raise exception 'This bowl could not be created. Please try again.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.bowl_members (bowl_id, user_id, role)
  values (v_bowl.id, v_user_id, 'Owner')
  on conflict (bowl_id, user_id) do nothing;

  return v_bowl;
end;
$$;

revoke all on function public.create_owned_bowl(uuid, text) from public, anon, authenticated;
grant execute on function public.create_owned_bowl(uuid, text) to authenticated;

drop function public._accessible_bowl_context(uuid);

create function public._accessible_bowl_context(p_user_id uuid)
returns table (id uuid, name text, owner_id uuid, remaining_count bigint,
               member_count bigint, last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.owner_id,
    (select count(*) from public.bowl_movies m
     where m.bowl_id = b.id and m.drawn_at is null),
    (select count(*) from (
      select b.owner_id as user_id where b.owner_id is not null
      union select bm.user_id from public.bowl_members bm where bm.bowl_id = b.id
    ) members),
    greatest(b.created_at, b.updated_at,
      (select max(greatest(m.added_at, m.drawn_at))
       from public.bowl_movies m where m.bowl_id = b.id))
  from public.bowls b
  where b.owner_id = p_user_id or exists (
    select 1 from public.bowl_members bm
    where bm.bowl_id = b.id and bm.user_id = p_user_id
  );
$$;

revoke all on function public._accessible_bowl_context(uuid) from public, anon, authenticated;

create or replace function public.get_my_bowl_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_default uuid;
  v_bowls jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to load your bowls.' using errcode = '42501';
  end if;
  for attempt in 1..2 loop
    v_default := public._ensure_user_bowl_default(v_user_id);
    select coalesce(jsonb_agg(to_jsonb(c) order by c.last_activity_at desc nulls last, c.name, c.id), '[]'::jsonb)
      into v_bowls from public._accessible_bowl_context(v_user_id) c;
    if (v_default is null and jsonb_array_length(v_bowls) = 0)
      or exists (select 1 from jsonb_array_elements(v_bowls) c where c->>'id' = v_default::text) then
      return jsonb_build_object('default_bowl_id', v_default, 'bowls', v_bowls);
    end if;
  end loop;
  raise exception 'Your bowls changed. Please try again.' using errcode = '40001';
end;
$$;

create or replace function public._record_bowl_movie_draw(
  p_bowl_movie_id uuid,
  p_watched_timezone text,
  p_turn_bucket_key text
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
    starter_pack,
    turn_bucket_key,
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
    v_movie.starter_pack,
    p_turn_bucket_key,
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
  -- that actually holds, for an older client or a direct call.
  if v_returned_at > v_draw_event.drawn_at + interval '2 hours' then
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
        v_draw_event.starter_pack,
        v_draw_event.note
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


alter table public.bowl_draw_events
  drop column if exists cuisine,
  drop column if exists place_id;

alter table public.bowl_movies
  drop column if exists cuisine,
  drop column if exists place_id;

alter table public.profiles
  drop column if exists restaurant_bowls_enabled;

alter table public.bowls
  drop column if exists kind;

commit;

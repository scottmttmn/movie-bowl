begin;

-- Restaurant bowls: a second kind of bowl that draws where to eat instead of
-- what to watch. Everything about drawing is shared -- members, draw access,
-- the three draw methods, rotation, returning a draw -- so a restaurant is a
-- slip in bowl_movies like any custom title, with a non-positive tmdb_id so
-- every TMDB pipeline already skips it. See output/designs/restaurant-bowls.md.

-- A bowl is one kind for life. Changing it would leave its slips describing
-- the wrong thing, and nothing in the app offers it.
alter table public.bowls
  add column kind text not null default 'movies'
  constraint bowls_kind_check check (kind in ('movies', 'restaurants'));

comment on column public.bowls.kind is
  'What the bowl draws: movies or restaurants. Set at creation and never changed.';

create function public._keep_bowl_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A bowl''s kind cannot change.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public._keep_bowl_kind() from public, anon, authenticated;

create trigger keep_bowl_kind
before update of kind on public.bowls
for each row execute function public._keep_bowl_kind();

-- The restaurant a slip names. place_id is Google's, the one piece of Places
-- data its terms let an app keep; cuisine is the adder's own choice.
alter table public.bowl_movies
  add column cuisine text
    constraint bowl_movies_cuisine_length check (char_length(cuisine) between 1 and 40),
  add column place_id text
    constraint bowl_movies_place_id_length check (char_length(place_id) between 1 and 512);

alter table public.bowl_draw_events
  add column cuisine text,
  add column place_id text;

comment on column public.bowl_movies.cuisine is
  'Restaurant bowls only: the cuisine the adder picked.';
comment on column public.bowl_movies.place_id is
  'Restaurant bowls only: the Google place id, when the slip came from search.';

-- A slip has to match its bowl. Restaurant slips never carry a TMDB id, which
-- is what keeps the filter cache, provider links, departure notices and the
-- snapshot refresh away from them; and a movie bowl never carries restaurant
-- fields. Starter packs and public add links insert TMDB titles, so this is
-- also what keeps them out of restaurant bowls.
create function public._match_bowl_movie_to_bowl_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.bowls where id = new.bowl_id;

  if v_kind = 'restaurants' and new.tmdb_id > 0 then
    raise exception 'Restaurant bowls hold restaurants, not movies.'
      using errcode = '22023';
  end if;

  if v_kind = 'movies' and (new.cuisine is not null or new.place_id is not null) then
    raise exception 'Movie bowls hold movies, not restaurants.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public._match_bowl_movie_to_bowl_kind() from public, anon, authenticated;

create trigger match_bowl_movie_to_bowl_kind
before insert or update of bowl_id, tmdb_id, cuisine, place_id on public.bowl_movies
for each row execute function public._match_bowl_movie_to_bowl_kind();

-- Hidden while it is new: an account turns restaurant bowls on in Settings.
-- Its own column for the same reason remove_from_bowls_on_solo_draw is one.
-- Being invited to a restaurant bowl shows that bowl regardless.
alter table public.profiles
  add column restaurant_bowls_enabled boolean not null default false;

comment on column public.profiles.restaurant_bowls_enabled is
  'Whether this account is offered restaurant bowls when creating a bowl.';

-- Creation takes the kind. The two-argument form keeps every existing caller
-- making movie bowls.
create function public.create_owned_bowl(p_bowl_id uuid, p_name text, p_kind text)
returns public.bowls
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_kind text := coalesce(p_kind, 'movies');
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

  if v_kind not in ('movies', 'restaurants') then
    raise exception 'Unknown bowl kind.'
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
    insert into public.bowls (id, owner_id, name, kind)
    values (p_bowl_id, v_user_id, v_name, v_kind)
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

create or replace function public.create_owned_bowl(p_bowl_id uuid, p_name text)
returns public.bowls
language sql
security definer
set search_path = public
as $$
  select * from public.create_owned_bowl(p_bowl_id, p_name, 'movies');
$$;

revoke all on function public.create_owned_bowl(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_owned_bowl(uuid, text, text) to authenticated;

comment on function public.create_owned_bowl(uuid, text, text) is
  'Creates a bowl of the given kind and its Owner membership in one transaction. Repeating the same bowl id returns the existing bowl.';

-- The account's bowl list carries each bowl's kind, so every screen knows
-- which kind of bowl it is showing without a second read.
drop function public._accessible_bowl_context(uuid);

create function public._accessible_bowl_context(p_user_id uuid)
returns table (id uuid, name text, owner_id uuid, remaining_count bigint,
               member_count bigint, last_activity_at timestamptz, kind text)
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
       from public.bowl_movies m where m.bowl_id = b.id)),
    b.kind
  from public.bowls b
  where b.owner_id = p_user_id or exists (
    select 1 from public.bowl_members bm
    where bm.bowl_id = b.id and bm.user_id = p_user_id
  );
$$;

revoke all on function public._accessible_bowl_context(uuid) from public, anon, authenticated;

-- The same read answers whether this account has turned restaurant bowls on,
-- so the create dialog knows whether to offer the choice without a second read.
create or replace function public.get_my_bowl_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_default uuid;
  v_bowls jsonb;
  v_restaurants boolean;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to load your bowls.' using errcode = '42501';
  end if;
  select coalesce(p.restaurant_bowls_enabled, false) into v_restaurants
    from public.profiles p where p.id = v_user_id;
  for attempt in 1..2 loop
    v_default := public._ensure_user_bowl_default(v_user_id);
    select coalesce(jsonb_agg(to_jsonb(c) order by c.last_activity_at desc nulls last, c.name, c.id), '[]'::jsonb)
      into v_bowls from public._accessible_bowl_context(v_user_id) c;
    if (v_default is null and jsonb_array_length(v_bowls) = 0)
      or exists (select 1 from jsonb_array_elements(v_bowls) c where c->>'id' = v_default::text) then
      return jsonb_build_object('default_bowl_id', v_default, 'bowls', v_bowls,
        'restaurant_bowls_enabled', coalesce(v_restaurants, false));
    end if;
  end loop;
  raise exception 'Your bowls changed. Please try again.' using errcode = '40001';
end;
$$;

-- A draw copies the restaurant onto its event, so the bowl's history can show
-- it, and writes no personal watch history for a restaurant bowl.
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
  v_bowl_kind text;
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

  select name, kind
  into v_bowl_name, v_bowl_kind
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
    note,
    cuisine,
    place_id
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
    v_movie.note,
    v_movie.cuisine,
    v_movie.place_id
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
    -- Personal history is a watch record. A restaurant drawn is not a movie
    -- watched, and Watch History has no way to show one.
    and v_bowl_kind = 'movies'
  on conflict (user_id, source_draw_event_id) do nothing;

  return query select v_draw_event_id, v_drawn_at;
end;
$$;


-- Returning a restaurant puts its cuisine and place back on the new slip.
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

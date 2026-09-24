-- Starter packs (output/designs/starter-packs.md): a bowl owner pours a small
-- sample of a named list into an empty bowl. The pack's slips belong to nobody.
-- They are in every person's pile, never take a turn of their own, and thin
-- out as the group adds, claims and draws.
--
-- Pack rows carry `added_by` null and the pack's name in `added_by_name`, the
-- same shape as a link guest's, so they are told apart by an explicit
-- `starter_pack` marker and never by name. A guest who types a pack's name
-- cannot become the pack.
--
-- The database does not know which titles belong to a pack. Knowing would mean
-- storing each pack's contents, which the sourcing rules forbid. Only the
-- owner can install, the rows land only in their own bowl, and every limit
-- still holds, so the worst case is an owner labelling up to fifteen titles of
-- their choosing as a pack in their own bowl.

begin;

-- The installation is the bowl's own state. The slips cannot answer "which
-- pack is installed": removal keeps drawn ones and claiming converts undrawn
-- ones, so a marker read off the rows would be stale or gone.
alter table public.bowls
  add column starter_pack text,
  add column starter_pack_installed_at timestamptz,
  add constraint bowls_starter_pack_slug_check
    check (starter_pack is null or starter_pack ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(starter_pack) <= 64),
  add constraint bowls_starter_pack_installed_at_check
    check ((starter_pack is null) = (starter_pack_installed_at is null));

-- A pack slip belongs to no account and came through no link, and it is never
-- pinned: a pin leads its owner's pile, and a shared slip is in every pile.
alter table public.bowl_movies
  add column starter_pack text,
  add constraint bowl_movies_starter_pack_slug_check
    check (starter_pack is null or starter_pack ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(starter_pack) <= 64),
  add constraint bowl_movies_starter_pack_shape_check
    check (
      starter_pack is null
      or (
        added_by is null
        and added_via_link_id is null
        and nullif(btrim(coalesce(added_by_name, '')), '') is not null
        and not is_pinned
      )
    );

-- `turn_bucket_key` is whose turn a draw spent. For an ordinary slip it is the
-- slip's own contributor and stays derivable; for a pack slip there is no
-- contributor on the row, so without it rotation would never see the turn as
-- taken and could hand the same person the next night too.
alter table public.bowl_draw_events
  add column starter_pack text,
  add column turn_bucket_key text;

-- The contributor bucket, as rotation has always derived it. Pack slips have
-- none, which is the point.
create function public._bowl_contributor_bucket_key(
  p_added_by uuid,
  p_added_by_name text,
  p_starter_pack text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_starter_pack is not null then null
    when p_added_by is not null then 'user:' || p_added_by::text
    when nullif(btrim(coalesce(p_added_by_name, '')), '') is not null
      then 'guest:' || lower(btrim(p_added_by_name))
    else 'guest:Link Guest'
  end;
$$;

revoke all on function public._bowl_contributor_bucket_key(uuid, text, text)
from public, anon, authenticated;

-- Parse and validate one movie snapshot the way consume_bowl_add_link does,
-- except that a pack title must be a real TMDB id: packs are built from TMDB,
-- and a custom title has no business in one.
create function public._starter_pack_movie_row(p_movie jsonb)
returns table (
  tmdb_id bigint,
  title text,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[],
  overview text
)
language plpgsql
stable
set search_path = public
as $$
begin
  if jsonb_typeof(p_movie) is distinct from 'object' then
    raise exception 'Each starter pack title must be an object.'
      using errcode = '22023';
  end if;

  begin
    tmdb_id := nullif(btrim(coalesce(p_movie->>'tmdb_id', p_movie->>'id', '')), '')::bigint;
    runtime := nullif(btrim(coalesce(p_movie->>'runtime', '')), '')::integer;
    release_date := nullif(btrim(coalesce(p_movie->>'release_date', '')), '')::date;
  exception
    when invalid_text_representation or datetime_field_overflow
      or invalid_datetime_format or numeric_value_out_of_range then
      raise exception 'A starter pack title is malformed.'
        using errcode = '22023';
  end;

  if tmdb_id is null or tmdb_id <= 0 then
    raise exception 'Starter pack titles must be TMDB titles.'
      using errcode = '22023';
  end if;

  title := nullif(btrim(coalesce(p_movie->>'title', '')), '');
  if title is null then
    raise exception 'Movie title is required'
      using errcode = '22023';
  end if;

  poster_path := nullif(btrim(coalesce(p_movie->>'poster_path', '')), '');
  overview := nullif(btrim(coalesce(p_movie->>'overview', '')), '');

  if jsonb_typeof(p_movie->'genres') = 'array' then
    select coalesce(array_agg(value), '{}')
    into genres
    from jsonb_array_elements_text(p_movie->'genres') as t(value);
  else
    genres := '{}';
  end if;

  return next;
end;
$$;

revoke all on function public._starter_pack_movie_row(jsonb)
from public, anon, authenticated;

create function public.install_bowl_starter_pack(
  p_bowl_id uuid,
  p_pack_slug text,
  p_pack_name text,
  p_movies jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bowl public.bowls%rowtype;
  v_pack_name text := nullif(btrim(coalesce(p_pack_name, '')), '');
  v_pack_count integer;
  v_active_count integer;
  v_element jsonb;
  v_movie record;
  v_seen bigint[] := '{}';
  v_inserted bigint[] := '{}';
  v_already_in_bowl bigint[] := '{}';
  v_over_limit bigint[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to add a starter pack.'
      using errcode = '42501';
  end if;

  if p_pack_slug is null
    or p_pack_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(p_pack_slug) > 64 then
    raise exception 'That starter pack is not recognized.'
      using errcode = '22023';
  end if;

  if v_pack_name is null or char_length(v_pack_name) > 80 then
    raise exception 'A starter pack needs a name of 80 characters or fewer.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_movies) is distinct from 'array'
    or jsonb_array_length(p_movies) = 0 then
    raise exception 'Choose at least one starter pack title.'
      using errcode = '22023';
  end if;

  -- The cap is fifteen; a few spares cover titles already in the bowl, and no
  -- honest client sends more.
  if jsonb_array_length(p_movies) > 30 then
    raise exception 'Too many starter pack titles were supplied.'
      using errcode = '22023';
  end if;

  -- Draws take this lock first, so an install cannot interleave with one.
  select *
  into v_bowl
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_bowl.owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can add a starter pack.'
      using errcode = '42501';
  end if;

  if v_bowl.starter_pack is not null and v_bowl.starter_pack <> p_pack_slug then
    raise exception 'This bowl already has a starter pack. Remove it before adding another.'
      using errcode = 'P0001';
  end if;

  select
    count(*) filter (where movie.starter_pack is not null)::integer,
    count(*)::integer
  into v_pack_count, v_active_count
  from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.drawn_at is null;

  for v_element in select value from jsonb_array_elements(p_movies)
  loop
    select * into v_movie from public._starter_pack_movie_row(v_element);

    if v_movie.tmdb_id = any(v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_movie.tmdb_id;

    -- A title already in the bowl is a clean skip, not a failed batch: the
    -- owner is told how many landed rather than having to try again.
    if exists (
      select 1
      from public.bowl_movies movie
      where movie.bowl_id = p_bowl_id
        and movie.drawn_at is null
        and movie.tmdb_id = v_movie.tmdb_id
    ) then
      v_already_in_bowl := v_already_in_bowl || v_movie.tmdb_id;
      continue;
    end if;

    if v_pack_count >= 15 or v_active_count >= 500 then
      v_over_limit := v_over_limit || v_movie.tmdb_id;
      continue;
    end if;

    insert into public.bowl_movies (
      bowl_id,
      added_by,
      added_by_name,
      starter_pack,
      tmdb_id,
      title,
      poster_path,
      release_date,
      runtime,
      genres,
      overview,
      snapshot_at
    )
    values (
      p_bowl_id,
      null,
      v_pack_name,
      p_pack_slug,
      v_movie.tmdb_id,
      v_movie.title,
      v_movie.poster_path,
      v_movie.release_date,
      v_movie.runtime,
      v_movie.genres,
      v_movie.overview,
      now()
    );

    v_inserted := v_inserted || v_movie.tmdb_id;
    v_pack_count := v_pack_count + 1;
    v_active_count := v_active_count + 1;
  end loop;

  -- An install that landed nothing leaves nothing installed. "Pull more" on
  -- the installed pack keeps its original installation time.
  if v_bowl.starter_pack is null and cardinality(v_inserted) > 0 then
    update public.bowls
    set starter_pack = p_pack_slug,
        starter_pack_installed_at = now()
    where id = p_bowl_id;
  end if;

  return jsonb_build_object(
    'starter_pack', case
      when v_bowl.starter_pack is not null or cardinality(v_inserted) > 0 then p_pack_slug
    end,
    'inserted', to_jsonb(v_inserted),
    'already_in_bowl', to_jsonb(v_already_in_bowl),
    'over_limit', to_jsonb(v_over_limit),
    'pack_slips', v_pack_count
  );
end;
$$;

create function public.remove_bowl_starter_pack(p_bowl_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_removed integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to remove a starter pack.'
      using errcode = '42501';
  end if;

  select bowl.owner_id
  into v_owner_id
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found or v_owner_id is distinct from auth.uid() then
    raise exception 'Only the bowl owner can remove a starter pack.'
      using errcode = '42501';
  end if;

  -- Only undrawn pack slips go. Drawn ones are history, and claimed ones are
  -- somebody's now. The one-pack rule means every undrawn pack slip is the
  -- installed pack's, so none is singled out by slug.
  delete from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.drawn_at is null
    and movie.starter_pack is not null;

  get diagnostics v_removed = row_count;

  update public.bowls
  set starter_pack = null,
      starter_pack_installed_at = null
  where id = p_bowl_id
    and starter_pack is not null;

  return v_removed;
end;
$$;

-- Adding a title that is an undrawn pack slip claims it: the slip becomes the
-- caller's own, in place, so the bowl keeps one active copy and the member can
-- pin it. The client cannot do this itself because it cannot update a row it
-- did not create.
create function public.claim_bowl_starter_pack_movie(
  p_bowl_id uuid,
  p_tmdb_id bigint,
  p_note text default null
)
returns public.bowl_movies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie public.bowl_movies%rowtype;
  v_note text := nullif(
    regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to add a movie.'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  if not (public.is_bowl_owner(p_bowl_id) or public.is_bowl_member(p_bowl_id)) then
    raise exception 'You no longer have access to this bowl.'
      using errcode = '42501';
  end if;

  -- Same lock order as a draw, so a claim and a draw of the same slip cannot
  -- both succeed.
  perform 1
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  select *
  into v_movie
  from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.tmdb_id = p_tmdb_id
    and movie.drawn_at is null
    and movie.starter_pack is not null
  for update;

  if not found then
    raise exception 'This movie is no longer in the starter pack.'
      using errcode = 'P0001';
  end if;

  update public.bowl_movies
  set added_by = auth.uid(),
      added_by_name = null,
      starter_pack = null,
      note = v_note,
      added_at = now()
  where id = v_movie.id
  returning * into v_movie;

  return v_movie;
end;
$$;

-- The persistence helper now snapshots the pack marker and records whose turn
-- the draw spent. Callers validate the turn; this only stores it.
create function public._record_bowl_movie_draw(
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

-- The two-argument helper stays for its callers, recording no turn.
create or replace function public._record_bowl_movie_draw(
  p_bowl_movie_id uuid,
  p_watched_timezone text
)
returns table (
  draw_event_id uuid,
  drawn_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select recorded.draw_event_id, recorded.drawn_at
  from public._record_bowl_movie_draw(p_bowl_movie_id, p_watched_timezone, null) recorded;
$$;

-- Person-first picks the person in the client, so when that person's pile
-- hands over a pack slip, the client names the turn. A bowl can switch to
-- rotation later, and rotation needs to know the turn was spent. A separate
-- overload rather than a defaulted argument, so the two-argument call keeps
-- exactly one match.
create function public.draw_bowl_movie(
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
  v_bowl_id uuid;
  v_starter_pack text;
  v_draw_method text;
  v_turn_bucket_key text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

  select movie.bowl_id, movie.starter_pack
  into v_bowl_id, v_starter_pack
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

  -- A turn is kept only where it means something: a pack slip, drawn in a
  -- person-first bowl, on the turn of someone who still has a pile of their
  -- own there. Anything else is dropped rather than failing the draw, because
  -- the draw itself is valid and the turn is bookkeeping.
  if v_starter_pack is not null
    and v_draw_method = 'person_first'
    and exists (
      select 1
      from public.bowl_movies movie
      where movie.bowl_id = v_bowl_id
        and movie.drawn_at is null
        and public._bowl_contributor_bucket_key(
          movie.added_by, movie.added_by_name, movie.starter_pack
        ) = p_turn_bucket_key
    ) then
    v_turn_bucket_key := p_turn_bucket_key;
  end if;

  return query
  select recorded.draw_event_id, recorded.drawn_at
  from public._record_bowl_movie_draw(
    p_bowl_movie_id,
    p_watched_timezone,
    v_turn_bucket_key
  ) recorded;
end;
$$;

create or replace function public.draw_bowl_movie(
  p_bowl_movie_id uuid,
  p_watched_timezone text
)
returns table (
  draw_event_id uuid,
  drawn_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select recorded.draw_event_id, recorded.drawn_at
  from public.draw_bowl_movie(p_bowl_movie_id, p_watched_timezone, null) recorded;
$$;

-- Rotation, with the pack in every pile. The person is chosen exactly as
-- before, from the people who own titles in the eligible pool; the title is
-- then chosen from that person's titles plus every eligible pack slip, the
-- pin still first. When nobody owns an eligible title the pack is the draw: a
-- flat pick that spends nobody's turn.
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
  v_turn_bucket_key text;
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

  with candidate_buckets as (
    select distinct public._bowl_contributor_bucket_key(
      movie.added_by, movie.added_by_name, movie.starter_pack
    ) as bucket_key
    from public.bowl_movies movie
    where movie.bowl_id = p_bowl_id
      and movie.drawn_at is null
      and movie.starter_pack is null
      and movie.id = any(p_candidate_movie_ids)
  ),
  -- A draw's turn is the one it recorded, else its slip's contributor. A pack
  -- draw that recorded no turn spent nobody's, and counts for no one.
  history_by_bucket as (
    select
      coalesce(
        event.turn_bucket_key,
        public._bowl_contributor_bucket_key(
          event.added_by, event.added_by_name, event.starter_pack
        )
      ) as bucket_key,
      max(event.drawn_at) as last_drawn_at
    from public.bowl_draw_events event
    where event.bowl_id = p_bowl_id
      and (event.turn_bucket_key is not null or event.starter_pack is null)
    group by 1
  )
  select candidate.bucket_key
  into v_turn_bucket_key
  from candidate_buckets candidate
  left join history_by_bucket history using (bucket_key)
  order by history.last_drawn_at asc nulls first, random()
  limit 1;

  select movie.id
  into v_selected_movie_id
  from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.drawn_at is null
    and movie.id = any(p_candidate_movie_ids)
    and (
      movie.starter_pack is not null
      or public._bowl_contributor_bucket_key(
        movie.added_by, movie.added_by_name, movie.starter_pack
      ) = v_turn_bucket_key
    )
  order by movie.is_pinned desc, random()
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
    p_watched_timezone,
    v_turn_bucket_key
  ) recorded;
end;
$$;

-- A pack slip drawn by mistake goes back as a pack slip, so the undo restores
-- what was there rather than a guest slip wearing the pack's name. If its pack
-- has since been removed, or replaced, the undo still happens -- the group did
-- not watch it -- but nothing goes back: restoring the slip would bring a
-- removed pack back into the bowl, and without its marker it would read as a
-- guest's. The result is then null.
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

revoke all on function public.install_bowl_starter_pack(uuid, text, text, jsonb)
from public, anon, authenticated;
revoke all on function public.remove_bowl_starter_pack(uuid)
from public, anon, authenticated;
revoke all on function public.claim_bowl_starter_pack_movie(uuid, bigint, text)
from public, anon, authenticated;
revoke all on function public._record_bowl_movie_draw(uuid, text, text)
from public, anon, authenticated;
revoke all on function public._record_bowl_movie_draw(uuid, text)
from public, anon, authenticated;
revoke all on function public.draw_bowl_movie(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.draw_bowl_movie(uuid, text)
from public, anon, authenticated;
revoke all on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
from public, anon, authenticated;
revoke all on function public.return_bowl_draw_to_bowl(uuid)
from public, anon, authenticated;

grant execute on function public.install_bowl_starter_pack(uuid, text, text, jsonb)
to authenticated;
grant execute on function public.remove_bowl_starter_pack(uuid)
to authenticated;
grant execute on function public.claim_bowl_starter_pack_movie(uuid, bigint, text)
to authenticated;
grant execute on function public.draw_bowl_movie(uuid, text, text)
to authenticated;
grant execute on function public.draw_bowl_movie(uuid, text)
to authenticated;
grant execute on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
to authenticated;
grant execute on function public.return_bowl_draw_to_bowl(uuid)
to authenticated;

comment on column public.bowls.starter_pack is
  'Slug of the starter pack installed in this bowl, or null. Set by install, cleared by removal.';
comment on column public.bowl_movies.starter_pack is
  'Slug of the starter pack this undrawn slip came from; a shared slip in every contributor pile.';
comment on column public.bowl_draw_events.starter_pack is
  'Snapshot of the drawn slip starter pack marker.';
comment on column public.bowl_draw_events.turn_bucket_key is
  'Contributor bucket whose turn this draw spent, when the slip itself names no contributor.';

comment on function public.install_bowl_starter_pack(uuid, text, text, jsonb) is
  'Owner-only: inserts up to 15 undrawn starter pack slips, one pack per bowl, skipping titles already in the bowl.';
comment on function public.remove_bowl_starter_pack(uuid) is
  'Owner-only: deletes undrawn starter pack slips and clears the installed pack.';
comment on function public.claim_bowl_starter_pack_movie(uuid, bigint, text) is
  'Converts an undrawn starter pack slip into the signed-in member own title, in place.';
comment on function public._record_bowl_movie_draw(uuid, text, text) is
  'Private persistence helper: clears pins, snapshots the pack marker, records the spent turn, and derives local watch dates.';
comment on function public._record_bowl_movie_draw(uuid, text) is
  'Private persistence helper that records no turn.';
comment on function public.draw_bowl_movie(uuid, text, text) is
  'Records an ordinary draw, keeping the person-first turn a starter pack slip was drawn on.';
comment on function public.draw_bowl_movie(uuid, text) is
  'Records an ordinary draw and derives its automatic watch date in the drawing device timezone.';
comment on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text) is
  'Atomically selects and records a rotation draw; starter pack slips join every contributor pile and never take a turn.';

commit;

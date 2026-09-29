-- MB-004: a starter pack top-up must not bring back a title the bowl already
-- drew. The client leaves drawn titles out of what it offers, but it learns
-- them from a history read that stops at the API's row cap, so on a bowl with
-- a long history the rule quietly stopped holding. It now holds here, under
-- the bowl lock the install already takes, however much history the client
-- managed to read.
--
-- A draw returned to the bowl never counted as watched, so it does not block
-- the title. A draw the owner removed from the watched history still happened,
-- which is how the client has always treated it, so it does.

create or replace function public.install_bowl_starter_pack(
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
  v_already_drawn bigint[] := '{}';
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

    if exists (
      select 1
      from public.bowl_draw_events event
      where event.bowl_id = p_bowl_id
        and event.returned_at is null
        and event.tmdb_id = v_movie.tmdb_id
    ) then
      v_already_drawn := v_already_drawn || v_movie.tmdb_id;
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
    'already_drawn', to_jsonb(v_already_drawn),
    'over_limit', to_jsonb(v_over_limit),
    'pack_slips', v_pack_count
  );
end;
$$;

comment on function public.install_bowl_starter_pack(uuid, text, text, jsonb) is
  'Owner-only: inserts up to 15 undrawn starter pack slips, one pack per bowl, skipping titles already in the bowl or already drawn from it.';

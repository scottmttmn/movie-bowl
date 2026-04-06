alter table public.bowl_add_links
  add column if not exists default_contributor_name text null;

alter table public.bowl_movies
  add column if not exists added_by_name text null;

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
  for update;

  if not found then
    raise exception 'Add link not found'
      using errcode = 'P0001';
  end if;

  if v_link.revoked_at is not null then
    raise exception 'Add link has been revoked'
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
    null,
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

  update public.bowl_add_links
  set adds_used = adds_used + 1,
      updated_at = now()
  where id = v_link.id
  returning max_adds - adds_used into remaining_adds;

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

grant execute on function public.consume_bowl_add_link(text, jsonb, text) to authenticated, anon, service_role;

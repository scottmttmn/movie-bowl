-- Move from contribution lead limits to equal-probability contributor draw.
-- Keep legacy queue/lead schema for compatibility, but remove active enforcement
-- and migrate pending queued rows into the bowl.

drop trigger if exists enforce_contribution_lead_before_bowl_movie_insert on public.bowl_movies;
drop function if exists public.enforce_bowl_movie_contribution_lead();

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
  snapshot_at
)
select
  q.bowl_id,
  q.queued_by,
  q.tmdb_id,
  q.title,
  q.poster_path,
  q.release_date,
  q.runtime,
  coalesce(q.genres, '{}'),
  q.overview,
  q.snapshot_at
from public.bowl_movie_queue q
where q.promoted_at is null
  and q.removed_at is null
  and not exists (
    select 1
    from public.bowl_movies m
    where m.bowl_id = q.bowl_id
      and m.added_by = q.queued_by
      and m.title = q.title
      and m.tmdb_id is not distinct from q.tmdb_id
      and m.snapshot_at is not distinct from q.snapshot_at
  );

update public.bowl_movie_queue
set promoted_at = coalesce(promoted_at, now())
where promoted_at is null
  and removed_at is null;

update public.bowls
set max_contribution_lead = null
where max_contribution_lead is not null;

update public.bowl_movies m
set added_by = l.created_by
from public.bowl_add_links l
where m.added_by is null
  and m.added_via_link_id = l.id;

update public.bowl_movies m
set added_by = b.owner_id
from public.bowls b
where m.added_by is null
  and m.bowl_id = b.id;

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

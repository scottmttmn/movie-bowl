create table if not exists public.bowl_add_links (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_adds integer not null check (max_adds >= 1),
  adds_used integer not null default 0 check (adds_used >= 0),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bowl_add_links_bowl_id_idx on public.bowl_add_links(bowl_id);
create index if not exists bowl_add_links_created_by_idx on public.bowl_add_links(created_by);

alter table public.bowl_movies
  alter column added_by drop not null;

alter table public.bowl_movies
  add column if not exists added_via_link_id uuid null references public.bowl_add_links(id) on delete set null;

create index if not exists bowl_movies_added_via_link_id_idx on public.bowl_movies(added_via_link_id);

alter table public.bowl_add_links enable row level security;

drop policy if exists "Bowl members can view add links" on public.bowl_add_links;
create policy "Bowl members can view add links"
on public.bowl_add_links
for select
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_add_links.bowl_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.bowl_members bm
    where bm.bowl_id = bowl_add_links.bowl_id
      and bm.user_id = auth.uid()
  )
);

drop policy if exists "Bowl members can create add links" on public.bowl_add_links;
create policy "Bowl members can create add links"
on public.bowl_add_links
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    exists (
      select 1
      from public.bowls b
      where b.id = bowl_add_links.bowl_id
        and b.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.bowl_members bm
      where bm.bowl_id = bowl_add_links.bowl_id
        and bm.user_id = auth.uid()
    )
  )
);

drop policy if exists "Bowl members can revoke add links" on public.bowl_add_links;
create policy "Bowl members can revoke add links"
on public.bowl_add_links
for update
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_add_links.bowl_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.bowl_members bm
    where bm.bowl_id = bowl_add_links.bowl_id
      and bm.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_add_links.bowl_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.bowl_members bm
    where bm.bowl_id = bowl_add_links.bowl_id
      and bm.user_id = auth.uid()
  )
);

create or replace function public.consume_bowl_add_link(
  p_token text,
  p_movie jsonb
)
returns table (
  bowl_id uuid,
  bowl_name text,
  remaining_adds integer,
  link_id uuid,
  movie_id uuid
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

  v_tmdb_id := nullif(trim(coalesce(p_movie->>'tmdb_id', p_movie->>'id', '')), '')::bigint;
  if v_tmdb_id is null then
    v_tmdb_id := -1 * floor(random() * 2000000000 + 1)::bigint;
  end if;

  v_runtime := nullif(trim(coalesce(p_movie->>'runtime', '')), '')::integer;
  v_release_date := nullif(trim(coalesce(p_movie->>'release_date', '')), '')::date;
  v_poster_path := nullif(trim(coalesce(p_movie->>'poster_path', '')), '');
  v_overview := nullif(trim(coalesce(p_movie->>'overview', '')), '');
  v_snapshot_at := coalesce(nullif(trim(coalesce(p_movie->>'snapshot_at', '')), '')::timestamptz, now());

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
    added_via_link_id
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
    v_link.id
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
  return next;
end;
$$;

grant execute on function public.consume_bowl_add_link(text, jsonb) to authenticated, anon, service_role;

-- Keep bowl activity and a person's watch history as separate, durable records.
-- A bowl draw creates one immutable bowl event and one personal watch event for
-- every current participant. Personal events survive leaving or deleting a bowl.

begin;

create table public.bowl_draw_events (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid references public.bowls(id) on delete set null,
  source_bowl_movie_id uuid unique references public.bowl_movies(id) on delete set null,
  bowl_name text not null,
  added_by uuid references public.profiles(id) on delete set null,
  added_by_name text,
  drawn_by uuid references public.profiles(id) on delete set null,
  tmdb_id bigint not null,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[] not null default '{}',
  overview text,
  snapshot_at timestamptz,
  drawn_at timestamptz not null default now(),
  returned_at timestamptz,
  returned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (returned_at is null or returned_at >= drawn_at)
);

create index bowl_draw_events_active_bowl_drawn_at_idx
  on public.bowl_draw_events (bowl_id, drawn_at desc)
  where returned_at is null;

create table public.user_watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_draw_event_id uuid references public.bowl_draw_events(id) on delete set null,
  source_kind text not null check (source_kind in ('bowl_draw', 'manual')),
  bowl_name text,
  tmdb_id bigint,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[] not null default '{}',
  overview text,
  watched_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_draw_event_id)
);

create index user_watch_events_user_watched_on_idx
  on public.user_watch_events (user_id, watched_on desc, created_at desc);

alter table public.bowl_draw_events enable row level security;
alter table public.user_watch_events enable row level security;

revoke all on table public.bowl_draw_events from public, anon, authenticated;
revoke all on table public.user_watch_events from public, anon, authenticated;
grant select on table public.bowl_draw_events to authenticated;
grant select on table public.user_watch_events to authenticated;

create policy bowl_draw_events_select_members
on public.bowl_draw_events
for select to authenticated
using (bowl_id is not null and public.is_bowl_member(bowl_id));

create policy user_watch_events_select_own
on public.user_watch_events
for select to authenticated
using (user_id = auth.uid());

create or replace function public.can_draw_from_bowl(p_bowl_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_bowl_owner(p_bowl_id)
    or (
      public.is_bowl_member(p_bowl_id)
      and exists (
        select 1
        from public.bowls b
        where b.id = p_bowl_id
          and (
            b.draw_access_mode = 'all_members'
            or (
              b.draw_access_mode = 'selected_members'
              and exists (
                select 1
                from public.bowl_draw_permissions permission
                where permission.bowl_id = p_bowl_id
                  and permission.user_id = auth.uid()
              )
            )
          )
      )
    );
$$;

revoke all on function public.can_draw_from_bowl(uuid) from public, anon, authenticated;

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

  select *
  into v_draw_event
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
      added_by_name
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
      coalesce(v_draw_event.snapshot_at, now()),
      v_draw_event.added_by_name
    )
    returning id into v_new_bowl_movie_id;
  exception
    when unique_violation then
      raise exception 'This movie is already in the bowl.'
        using errcode = '23505', constraint = 'bowl_active_tmdb_movies_pkey';
  end;

  update public.bowl_draw_events
  set returned_at = now(),
      returned_by = auth.uid()
  where id = v_draw_event.id;

  delete from public.user_watch_events
  where source_draw_event_id = v_draw_event.id
    and source_kind = 'bowl_draw';

  return v_new_bowl_movie_id;
end;
$$;

create or replace function public.create_manual_watch_event(
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
    raise exception 'A movie title is required.'
      using errcode = 'P0001';
  end if;

  if p_watched_on is null then
    raise exception 'A watched date is required.'
      using errcode = 'P0001';
  end if;

  insert into public.user_watch_events (
    user_id,
    source_kind,
    title,
    tmdb_id,
    poster_path,
    release_date,
    runtime,
    genres,
    overview,
    watched_on
  )
  values (
    auth.uid(),
    'manual',
    v_title,
    p_tmdb_id,
    p_poster_path,
    p_release_date,
    p_runtime,
    coalesce(p_genres, '{}'),
    p_overview,
    p_watched_on
  )
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.update_user_watch_event(
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
    raise exception 'A movie title is required.'
      using errcode = 'P0001';
  end if;

  if p_watched_on is null then
    raise exception 'A watched date is required.'
      using errcode = 'P0001';
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
    raise exception 'This history entry is no longer available.'
      using errcode = 'P0001';
  end if;

  return v_event;
end;
$$;

create or replace function public.delete_user_watch_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to remove watch history.'
      using errcode = '42501';
  end if;

  delete from public.user_watch_events
  where id = p_event_id
    and user_id = auth.uid();

  if not found then
    raise exception 'This history entry is no longer available.'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.draw_bowl_movie(uuid) from public, anon;
revoke all on function public.return_bowl_draw_to_bowl(uuid) from public, anon;
revoke all on function public.create_manual_watch_event(text, date, bigint, text, date, integer, text[], text) from public, anon;
revoke all on function public.update_user_watch_event(uuid, text, date, date) from public, anon;
revoke all on function public.delete_user_watch_event(uuid) from public, anon;

grant execute on function public.draw_bowl_movie(uuid) to authenticated;
grant execute on function public.return_bowl_draw_to_bowl(uuid) to authenticated;
grant execute on function public.create_manual_watch_event(text, date, bigint, text, date, integer, text[], text) to authenticated;
grant execute on function public.update_user_watch_event(uuid, text, date, date) to authenticated;
grant execute on function public.delete_user_watch_event(uuid) to authenticated;

-- Preserve existing bowl history for people we can identify today. Historical
-- membership snapshots do not exist, so this includes the current bowl roster,
-- the original contributor, and the person who made the draw.
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
select
  movie.bowl_id,
  movie.id,
  bowl.name,
  movie.added_by,
  movie.added_by_name,
  movie.drawn_by,
  movie.tmdb_id,
  movie.title,
  movie.poster_path,
  movie.release_date,
  movie.runtime,
  coalesce(movie.genres, '{}'),
  movie.overview,
  movie.snapshot_at,
  movie.drawn_at
from public.bowl_movies movie
join public.bowls bowl on bowl.id = movie.bowl_id
where movie.drawn_at is not null
  and not exists (
    select 1
    from public.bowl_draw_events event
    where event.source_bowl_movie_id = movie.id
  );

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
  event.id,
  'bowl_draw',
  event.bowl_name,
  event.tmdb_id,
  event.title,
  event.poster_path,
  event.release_date,
  event.runtime,
  event.genres,
  event.overview,
  (event.drawn_at at time zone 'utc')::date
from public.bowl_draw_events event
join public.bowls bowl on bowl.id = event.bowl_id
cross join lateral (
  select bowl.owner_id as user_id
  union
  select member.user_id
  from public.bowl_members member
  where member.bowl_id = bowl.id
  union
  select event.added_by
  union
  select event.drawn_by
) participant
where participant.user_id is not null
on conflict (user_id, source_draw_event_id) do nothing;

commit;

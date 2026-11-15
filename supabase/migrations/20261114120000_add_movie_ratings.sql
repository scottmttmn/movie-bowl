-- One rating per person per movie, on four thumbs: -2, -1, 1, 2. Unrated is
-- no row, never a zero, so leaving a movie unrated can never read as a
-- verdict. See output/designs/movie-ratings.md.
--
-- A TMDB movie is rated once, whatever history entries it has, so a rewatch
-- shows the same thumbs. A custom title has no shared id to rate it by, so its
-- rating hangs on the history entry it was given on.
--
-- A rating shows only beside a history entry. Deleting a person's last entry
-- of a movie (including the one a draw returned to the bowl takes away)
-- deletes their rating of it with it.
--
-- Bowl-mates see each other's thumbs on a bowl's watched movies, and only
-- once they have rated that movie themselves: before that they learn who has
-- rated, never what. The concealment is in the database rather than the
-- page, so the reveal cannot be read early.

begin;

create table public.user_movie_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint check (tmdb_id > 0),
  watch_event_id uuid references public.user_watch_events(id) on delete cascade,
  rating smallint not null check (rating in (-2, -1, 1, 2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_movie_ratings_one_key check ((tmdb_id is null) <> (watch_event_id is null)),
  unique (user_id, tmdb_id),
  unique (watch_event_id)
);

alter table public.user_movie_ratings enable row level security;

-- Each person reads their own; every write goes through the function below,
-- which is what keeps a rating attached to an entry its writer owns.
revoke all on table public.user_movie_ratings from public, anon, authenticated, service_role;
grant select on table public.user_movie_ratings to authenticated;
grant select, insert, update, delete on table public.user_movie_ratings to service_role;

create policy user_movie_ratings_select_own
on public.user_movie_ratings
for select to authenticated
using (user_id = auth.uid());

-- Rates the movie a history entry of yours is about. A null rating clears it.
create function public.set_my_movie_rating(p_watch_event_id uuid, p_rating smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_tmdb_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to rate movies'
      using errcode = '42501';
  end if;

  if p_rating is not null and p_rating not in (-2, -1, 1, 2) then
    raise exception 'A rating is two down, one down, one up or two up'
      using errcode = '22023';
  end if;

  select * into v_event
  from public.user_watch_events
  where id = p_watch_event_id
    and user_id = auth.uid();

  if not found then
    raise exception 'That movie is not in your watch history'
      using errcode = 'P0002';
  end if;

  v_tmdb_id := case when v_event.tmdb_id > 0 then v_event.tmdb_id end;

  if p_rating is null then
    if v_tmdb_id is not null then
      delete from public.user_movie_ratings
      where user_id = auth.uid() and tmdb_id = v_tmdb_id;
    else
      delete from public.user_movie_ratings
      where watch_event_id = v_event.id;
    end if;

    return jsonb_build_object('rating', null);
  end if;

  if v_tmdb_id is not null then
    insert into public.user_movie_ratings (user_id, tmdb_id, rating)
    values (auth.uid(), v_tmdb_id, p_rating)
    on conflict (user_id, tmdb_id) do update
      set rating = excluded.rating,
          updated_at = pg_catalog.now();
  else
    insert into public.user_movie_ratings (user_id, watch_event_id, rating)
    values (auth.uid(), v_event.id, p_rating)
    on conflict (watch_event_id) do update
      set rating = excluded.rating,
          updated_at = pg_catalog.now();
  end if;

  return jsonb_build_object('rating', p_rating);
end;
$$;

-- A TMDB rating outlives one entry but not the last: whichever function
-- deleted the entry, the rating goes once nothing of that movie is left.
create function public.drop_unwatched_movie_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.tmdb_id > 0 and not exists (
    select 1
    from public.user_watch_events event
    where event.user_id = old.user_id
      and event.tmdb_id = old.tmdb_id
  ) then
    delete from public.user_movie_ratings
    where user_id = old.user_id
      and tmdb_id = old.tmdb_id;
  end if;

  return null;
end;
$$;

revoke all on function public.drop_unwatched_movie_rating() from public, anon, authenticated;

create trigger user_watch_events_drop_unwatched_rating
after delete on public.user_watch_events
for each row execute function public.drop_unwatched_movie_rating();

-- The thumbs on a bowl's watched movies: one row per active draw and current
-- member who has rated it, named the way the bowl's profile directory names
-- them. Your own rows always carry the rating; another member's carry it only
-- once you have rated that draw's movie too.
create function public.get_bowl_watched_ratings(p_bowl_id uuid)
returns table (draw_event_id uuid, user_id uuid, display_name text, rating smallint, is_self boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select auth.uid() as id
  ),
  allowed as (
    select 1
    from caller
    where caller.id is not null
      and (
        exists (
          select 1 from public.bowls b
          where b.id = p_bowl_id and b.owner_id = caller.id
        )
        or exists (
          select 1 from public.bowl_members m
          where m.bowl_id = p_bowl_id and m.user_id = caller.id
        )
      )
  ),
  members as (
    select b.owner_id as user_id
    from public.bowls b
    where b.id = p_bowl_id and b.owner_id is not null
    union
    select m.user_id
    from public.bowl_members m
    where m.bowl_id = p_bowl_id and m.user_id is not null
  ),
  draws as (
    select d.id, d.tmdb_id
    from public.bowl_draw_events d
    where d.bowl_id = p_bowl_id
      and d.returned_at is null
      and d.removed_at is null
      and exists (select 1 from allowed)
  ),
  rated as (
    select draws.id as draw_event_id, members.user_id, r.rating
    from draws
    cross join members
    join public.user_movie_ratings r
      on r.user_id = members.user_id
     and (
       (draws.tmdb_id > 0 and r.tmdb_id = draws.tmdb_id
         and exists (
           select 1 from public.user_watch_events e
           where e.user_id = members.user_id and e.tmdb_id = draws.tmdb_id
         ))
       or (coalesce(draws.tmdb_id, 0) <= 0 and r.watch_event_id in (
         select e.id from public.user_watch_events e
         where e.user_id = members.user_id and e.source_draw_event_id = draws.id
       ))
     )
  )
  select
    rated.draw_event_id,
    rated.user_id,
    profile.display_name,
    case
      when rated.user_id = (select id from caller) then rated.rating
      when exists (
        select 1 from rated mine
        where mine.draw_event_id = rated.draw_event_id
          and mine.user_id = (select id from caller)
      ) then rated.rating
    end as rating,
    rated.user_id = (select id from caller) as is_self
  from rated
  left join public.profiles profile on profile.id = rated.user_id;
$$;

-- The shared history link carries the owner's thumbs beside their comments,
-- under the same switch: "Show my comments" is "show what I thought".
create or replace function public.get_shared_watch_history(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'display_name', profile.display_name,
    'include_comments', link.include_comments,
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tmdb_id', event.tmdb_id,
          'title', event.title,
          'poster_path', event.poster_path,
          'release_date', event.release_date,
          'watched_on', event.watched_on,
          'personal_note', case when link.include_comments then event.personal_note end,
          'rating', case when link.include_comments then (
            select r.rating
            from public.user_movie_ratings r
            where r.user_id = event.user_id
              and (
                (event.tmdb_id > 0 and r.tmdb_id = event.tmdb_id)
                or r.watch_event_id = event.id
              )
            limit 1
          ) end
        )
        order by event.watched_on desc, event.created_at desc, event.id
      )
      from public.user_watch_events event
      where event.user_id = link.user_id
    ), '[]'::jsonb)
  )
  from public.watch_history_share_links link
  left join public.profiles profile on profile.id = link.user_id
  where p_token is not null
    and link.token = p_token;
$$;

revoke all on function public.set_my_movie_rating(uuid, smallint) from public, anon;
revoke all on function public.get_bowl_watched_ratings(uuid) from public, anon;

grant execute on function public.set_my_movie_rating(uuid, smallint) to authenticated;
grant execute on function public.get_bowl_watched_ratings(uuid) to authenticated;

commit;

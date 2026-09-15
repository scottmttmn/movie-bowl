-- Record a solo draw as a private watch event that changes no bowl.
-- A solo draw is the group draw minus the group: one user_watch_events row and
-- nothing else. No bowl_draw_events row, because the group drew nothing, and no
-- drawn_at stamp, because the title must not vanish from bowls whose members had
-- no part in the evening. See output/designs/solo-draw.md.
--
-- The server builds the snapshot from the slip rather than trusting the client,
-- so a solo entry always describes a title that really was one of the caller's
-- own undrawn slips. The entry keeps its source row so watch history can later
-- offer "Remove from my bowls…" for a custom title, whose negative synthetic
-- tmdb_id no lookup by id can find, and a caller-generated request id so a save
-- retried after an uncertain answer returns the first entry instead of drawing
-- a second one.

begin;

alter table public.user_watch_events
  add column source_bowl_movie_id uuid references public.bowl_movies(id) on delete set null,
  add column source_bowl_id uuid references public.bowls(id) on delete set null,
  add column request_id uuid;

alter table public.user_watch_events
  drop constraint if exists user_watch_events_source_kind_check;

alter table public.user_watch_events
  add constraint user_watch_events_source_kind_check
  check (source_kind in ('bowl_draw', 'manual', 'solo_draw'));

-- A solo entry must be recognizable as one forever: the removal offer, the undo
-- label and the read-only note all branch on it. Tying the new columns to the
-- new kind keeps a solo row from being written as an indistinguishable manual
-- one, or a manual row from claiming a source it never had.
alter table public.user_watch_events
  add constraint user_watch_events_solo_draw_shape_check
  check (
    (source_kind = 'solo_draw') = (request_id is not null)
    and (
      source_kind = 'solo_draw'
      or (source_bowl_movie_id is null and source_bowl_id is null)
    )
  );

-- Replay protection. Partial, because only solo rows carry a request id and the
-- older kinds must stay insertable without one.
create unique index user_watch_events_user_request_idx
  on public.user_watch_events (user_id, request_id)
  where request_id is not null;

create index user_watch_events_source_bowl_movie_idx
  on public.user_watch_events (source_bowl_movie_id)
  where source_bowl_movie_id is not null;

create function public.record_solo_draw(
  p_bowl_movie_id uuid,
  p_watched_timezone text,
  p_request_id uuid
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_movie public.bowl_movies%rowtype;
  v_bowl_name text;
  v_watched_timezone text := coalesce(nullif(btrim(p_watched_timezone), ''), 'UTC');
  v_watched_on date;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw a movie.'
      using errcode = '42501';
  end if;

  if p_request_id is null then
    raise exception 'A draw request id is required.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names timezone_info
    where timezone_info.name = v_watched_timezone
  ) then
    raise exception 'The watched timezone is not recognized.'
      using errcode = '22023';
  end if;

  -- A retry of an answer the caller never saw must return the original draw.
  -- Pairing the request id with the movie it drew means a client reusing an id
  -- for a different movie is told so rather than silently handed the old pick.
  select *
  into v_event
  from public.user_watch_events
  where user_id = auth.uid()
    and request_id = p_request_id;

  if found then
    if v_event.source_bowl_movie_id is distinct from p_bowl_movie_id then
      raise exception 'This draw was already recorded for a different movie.'
        using errcode = 'P0001';
    end if;

    return v_event;
  end if;

  select *
  into v_movie
  from public.bowl_movies
  where id = p_bowl_movie_id
    and added_by = auth.uid()
    and added_by_name is null
    and added_via_link_id is null
    and drawn_at is null;

  -- Losing access to a bowl revokes drawing from it even while the caller still
  -- knows a row uuid they created, and the generic message keeps a stale id
  -- indistinguishable from somebody else's.
  if not found
    or not (
      public.is_bowl_owner(v_movie.bowl_id)
      or public.is_bowl_member(v_movie.bowl_id)
    )
  then
    raise exception 'This movie is no longer available to draw.'
      using errcode = 'P0001';
  end if;

  select name
  into v_bowl_name
  from public.bowls
  where id = v_movie.bowl_id;

  if v_bowl_name is null then
    raise exception 'This movie is no longer available to draw.'
      using errcode = 'P0001';
  end if;

  v_watched_on := (now() at time zone v_watched_timezone)::date;

  begin
    insert into public.user_watch_events (
      user_id,
      source_kind,
      source_bowl_movie_id,
      source_bowl_id,
      request_id,
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
    values (
      auth.uid(),
      'solo_draw',
      v_movie.id,
      v_movie.bowl_id,
      p_request_id,
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
    )
    returning * into v_event;
  exception
    when unique_violation then
      -- Two retries in flight at once: the loser reports the winner's draw.
      select *
      into v_event
      from public.user_watch_events
      where user_id = auth.uid()
        and request_id = p_request_id;

      if not found then
        raise;
      end if;
  end;

  return v_event;
end;
$$;

revoke all on function public.record_solo_draw(uuid, text, uuid)
from public, anon, authenticated;

grant execute on function public.record_solo_draw(uuid, text, uuid) to authenticated;

comment on function public.record_solo_draw(uuid, text, uuid) is
  'Records a private solo draw of the caller own undrawn slip without changing any bowl.';

comment on column public.user_watch_events.source_bowl_movie_id is
  'Solo draws only: the slip that was drawn, for the later remove-from-bowls lookup.';

comment on column public.user_watch_events.source_bowl_id is
  'Solo draws only: the bowl the drawn slip came from.';

comment on column public.user_watch_events.request_id is
  'Solo draws only: caller-generated id making a retried draw idempotent.';

commit;

-- Reverts automatic removal on solo draws: drops the setting, the undo
-- operation and the snapshots of what draws removed, and puts record_solo_draw
-- and delete_user_watch_event back the way they were.
--
-- This does not put any removed copy back in a bowl. The snapshots are the only
-- record that those rows ever existed, and this drops them, so undo any draw
-- still inside its two-hour window before running this. The removals themselves
-- were asked for by the accounts that turned the setting on, which is why the
-- revert leaves them alone rather than resurrecting titles people chose to let
-- go. Solo history itself is untouched.

begin;

drop function if exists public.undo_solo_draw(uuid);

create or replace function public.record_solo_draw(
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


comment on function public.record_solo_draw(uuid, text, uuid) is
  'Records a private solo draw of the caller own undrawn slip without changing any bowl.';

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

drop table if exists public.solo_draw_removed_copies;

alter table public.profiles
  drop column if exists remove_from_bowls_on_solo_draw;

commit;

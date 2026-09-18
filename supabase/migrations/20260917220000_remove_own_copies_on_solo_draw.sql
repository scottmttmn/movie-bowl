-- Opt-in: remove your own copies of a title from your bowls when you draw it
-- solo, and make undo restore them. See "Later: Remove Automatically" in
-- output/designs/solo-draw.md.
--
-- The shipped solo draw leaves every copy where it is and offers removal from
-- personal history, so undo is only a word for deleting the entry. Turning this
-- setting on inverts that: a random pick would otherwise cost you the title in
-- every bowl -- its note, its pin and its place -- with no chance to decline.
-- So while the setting is on, undo becomes a real operation, and the rows the
-- draw deleted are kept as a snapshot until the entry is undone or deleted.
--
-- The setting is a column rather than a key in profiles.default_draw_settings
-- because the server has to read it inside the draw's own transaction, and
-- because that column is a client-normalized blob: a client from an older
-- deploy saving its own shape would drop a key it has never heard of, silently
-- turning the setting off.

begin;

alter table public.profiles
  add column remove_from_bowls_on_solo_draw boolean not null default false;

comment on column public.profiles.remove_from_bowls_on_solo_draw is
  'Opt-in: a solo draw also removes the caller own undrawn copies of the title.';

-- What the draw deleted, kept as it was so undo can put it back. Keyed by the
-- entry rather than by the slip: a restored copy can be removed again by a
-- later draw, and each of those removals belongs to its own entry's undo.
-- Cascading from the entry is what makes ordinary deletion after the window
-- final -- the snapshot goes with the entry it belonged to.
create table public.solo_draw_removed_copies (
  watch_event_id uuid not null references public.user_watch_events(id) on delete cascade,
  bowl_movie_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Null once the bowl is gone, while bowl_name survives: a copy that cannot go
  -- back still has to be named in what undo reports it skipped.
  bowl_id uuid references public.bowls(id) on delete set null,
  bowl_name text not null,
  tmdb_id bigint,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[] not null default '{}',
  overview text,
  note text,
  is_pinned boolean not null default false,
  added_at timestamptz not null,
  snapshot_at timestamptz,
  removed_at timestamptz not null default now(),
  primary key (watch_event_id, bowl_movie_id)
);

create index solo_draw_removed_copies_user_idx
  on public.solo_draw_removed_copies (user_id);

alter table public.solo_draw_removed_copies enable row level security;

-- Readable by the person whose copies they were, so the reveal and the history
-- entry can name the bowls a draw emptied. Never written from the client: both
-- writers are security definer functions that own the ownership checks.
create policy solo_draw_removed_copies_select_own
on public.solo_draw_removed_copies
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.solo_draw_removed_copies from public, anon, authenticated;
grant select on table public.solo_draw_removed_copies to authenticated;

comment on table public.solo_draw_removed_copies is
  'Copies a solo draw removed from the caller bowls, retained so undo can restore them.';

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
  v_remove_copies boolean := false;
  v_copy record;
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
    -- source_bowl_movie_id is a foreign key that nulls itself when the slip is
    -- gone, and with this setting on the draw itself is what deletes the slip.
    -- The snapshot is then the only record of which row this entry drew, so a
    -- retry is matched against it before the id is called a different movie.
    if v_event.source_bowl_movie_id is distinct from p_bowl_movie_id
      and not exists (
        select 1
        from public.solo_draw_removed_copies
        where watch_event_id = v_event.id
          and bowl_movie_id = p_bowl_movie_id
      )
    then
      raise exception 'This draw was already recorded for a different movie.'
        using errcode = 'P0001';
    end if;

    -- The retry returns here, before any removal, so a draw never removes a
    -- second set of copies for an entry that already exists.
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

      return v_event;
  end;

  select coalesce(remove_from_bowls_on_solo_draw, false)
  into v_remove_copies
  from public.profiles
  where id = auth.uid();

  if coalesce(v_remove_copies, false) then
    -- Every accessible own undrawn copy, not only the ones in the draw's scope:
    -- once you have watched it, you have watched it everywhere. Custom titles
    -- carry a negative synthetic id unique to their row, so they match by the
    -- drawn row itself rather than by title.
    for v_copy in
      select movie.*, bowl.name as bowl_name
      from public.bowl_movies movie
      join public.bowls bowl on bowl.id = movie.bowl_id
      where movie.added_by = auth.uid()
        and movie.added_by_name is null
        and movie.added_via_link_id is null
        and movie.drawn_at is null
        and (
          movie.id = v_movie.id
          or (v_movie.tmdb_id > 0 and movie.tmdb_id = v_movie.tmdb_id)
        )
        and (
          public.is_bowl_owner(movie.bowl_id)
          or public.is_bowl_member(movie.bowl_id)
        )
      for update of movie
    loop
      insert into public.solo_draw_removed_copies (
        watch_event_id,
        bowl_movie_id,
        user_id,
        bowl_id,
        bowl_name,
        tmdb_id,
        title,
        poster_path,
        release_date,
        runtime,
        genres,
        overview,
        note,
        is_pinned,
        added_at,
        snapshot_at
      )
      values (
        v_event.id,
        v_copy.id,
        auth.uid(),
        v_copy.bowl_id,
        v_copy.bowl_name,
        v_copy.tmdb_id,
        v_copy.title,
        v_copy.poster_path,
        v_copy.release_date,
        v_copy.runtime,
        coalesce(v_copy.genres, '{}'),
        v_copy.overview,
        v_copy.note,
        v_copy.is_pinned,
        v_copy.added_at,
        v_copy.snapshot_at
      );

      delete from public.bowl_movies where id = v_copy.id;
    end loop;
  end if;

  return v_event;
end;
$$;

comment on function public.record_solo_draw(uuid, text, uuid) is
  'Records a private solo draw, removing the caller own copies only when their profile asks for it.';

-- Undo, for the entries whose draw took something away. Deletes the entry and
-- puts back what it can, which is the whole difference between this and
-- delete_user_watch_event: a copy whose bowl is gone, whose access is gone, or
-- whose place has since been taken by another copy of the same title cannot go
-- back, so it is reported instead of being forced.
create function public.undo_solo_draw(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_copy public.solo_draw_removed_copies%rowtype;
  v_restored integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_pinned boolean;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to undo a draw.'
      using errcode = '42501';
  end if;

  select *
  into v_event
  from public.user_watch_events
  where id = p_event_id
    and user_id = auth.uid()
    and source_kind = 'solo_draw'
  for update;

  if not found then
    raise exception 'This solo draw is no longer available to undo.'
      using errcode = 'P0001';
  end if;

  -- Measured from the commit time the server wrote, never from the editable
  -- watched date, and enforced here rather than trusted from the label.
  if now() - v_event.created_at > interval '2 hours' then
    raise exception 'This draw can no longer be undone.'
      using errcode = 'P0001';
  end if;

  for v_copy in
    select *
    from public.solo_draw_removed_copies
    where watch_event_id = v_event.id
    order by bowl_name, title
  loop
    v_reason := null;

    if v_copy.bowl_id is null
      or not exists (select 1 from public.bowls where id = v_copy.bowl_id)
    then
      v_reason := 'bowl_gone';
    elsif not (
      public.is_bowl_owner(v_copy.bowl_id)
      or public.is_bowl_member(v_copy.bowl_id)
    ) then
      v_reason := 'no_access';
    elsif exists (
      select 1
      from public.bowl_movies movie
      where movie.id = v_copy.bowl_movie_id
    ) or exists (
      -- Anyone's copy, not only your own: bowl_active_tmdb_movies admits one
      -- active copy of a title per bowl whoever added it, so a title somebody
      -- else re-added while yours was gone is the place being taken. Custom
      -- titles hold a negative synthetic id that registry ignores, so for them
      -- only the row id above can collide.
      select 1
      from public.bowl_movies movie
      where movie.bowl_id = v_copy.bowl_id
        and movie.drawn_at is null
        and coalesce(v_copy.tmdb_id, 0) > 0
        and movie.tmdb_id = v_copy.tmdb_id
    ) then
      v_reason := 'already_added';
    end if;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object(
        'bowl_name', v_copy.bowl_name,
        'title', v_copy.title,
        'reason', v_reason
      );
      continue;
    end if;

    -- The pin is part of "as it was", but a contributor may hold only one pin
    -- per bowl and the pin may have moved while the copy was gone. The copy
    -- still goes back; only its pin is dropped, because refusing the whole
    -- restore over it would lose more than it protects.
    v_pinned := v_copy.is_pinned;
    if v_pinned and exists (
      select 1
      from public.bowl_movies movie
      where movie.bowl_id = v_copy.bowl_id
        and movie.added_by = auth.uid()
        and movie.is_pinned
        and movie.drawn_at is null
    ) then
      v_pinned := false;
    end if;

    insert into public.bowl_movies (
      id,
      bowl_id,
      added_by,
      tmdb_id,
      title,
      poster_path,
      release_date,
      runtime,
      genres,
      overview,
      note,
      is_pinned,
      added_at,
      snapshot_at
    )
    values (
      v_copy.bowl_movie_id,
      v_copy.bowl_id,
      auth.uid(),
      v_copy.tmdb_id,
      v_copy.title,
      v_copy.poster_path,
      v_copy.release_date,
      v_copy.runtime,
      coalesce(v_copy.genres, '{}'),
      v_copy.overview,
      v_copy.note,
      v_pinned,
      v_copy.added_at,
      v_copy.snapshot_at
    );

    v_restored := v_restored + 1;
  end loop;

  -- Undo still deletes the entry, whatever could not go back. The snapshot rows
  -- cascade with it.
  delete from public.user_watch_events
  where id = v_event.id
    and user_id = auth.uid();

  return jsonb_build_object(
    'restored', v_restored,
    'skipped', v_skipped
  );
end;
$$;

revoke all on function public.undo_solo_draw(uuid) from public, anon, authenticated;
grant execute on function public.undo_solo_draw(uuid) to authenticated;

comment on function public.undo_solo_draw(uuid) is
  'Undoes a solo draw within two hours: deletes the entry and restores the copies it removed.';

-- A client from before this deploy would call delete_user_watch_event on a solo
-- entry inside the undo window and quietly throw away the restore. Refusing
-- exactly that case keeps an old tab from turning undo into deletion, and says
-- what to do about it. Every other entry deletes as it always has.
create or replace function public.delete_user_watch_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to remove watch history.'
      using errcode = '42501';
  end if;

  select *
  into v_event
  from public.user_watch_events
  where id = p_event_id
    and user_id = auth.uid();

  if not found then
    raise exception 'This history entry is no longer available.'
      using errcode = 'P0001';
  end if;

  if v_event.source_kind = 'solo_draw'
    and now() - v_event.created_at <= interval '2 hours'
    and exists (
      select 1
      from public.solo_draw_removed_copies
      where watch_event_id = v_event.id
    )
  then
    raise exception 'Undo this draw instead, so the copies it removed go back to your bowls.'
      using errcode = 'P0001';
  end if;

  delete from public.user_watch_events
  where id = v_event.id
    and user_id = auth.uid();

  if not found then
    raise exception 'This history entry is no longer available.'
      using errcode = 'P0001';
  end if;

  return true;
end;
$$;

commit;

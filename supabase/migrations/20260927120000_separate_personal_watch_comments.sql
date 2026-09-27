-- Separate what you thought of a movie from why it was in the bowl.
--
-- Until now user_watch_events.note meant two things: on a drawn entry it was
-- the slip's reason, copied at the draw and read-only; on a manual entry it was
-- the person's own comment. That left nowhere to write a reaction to anything
-- that came out of a bowl. From here `note` means "why it was in the bowl" in
-- all three tables, and personal_note is the watcher's own comment on every
-- kind of entry. The copied reason stays on the history row rather than being
-- read from the draw event, because personal history has to outlive leaving or
-- deleting the bowl.

begin;

alter table public.user_watch_events
  add column personal_note text null;

alter table public.user_watch_events
  add constraint user_watch_events_personal_note_length_check
  check (personal_note is null or char_length(personal_note) <= 500);

-- A manual entry never came off a slip, so what it holds was always the
-- person's own comment.
update public.user_watch_events
set personal_note = note,
    note = null
where source_kind = 'manual'
  and note is not null;

alter table public.user_watch_events
  add constraint user_watch_events_manual_has_no_bowl_note_check
  check (source_kind <> 'manual' or note is null);

create or replace function public.create_manual_watch_event(
  p_title text,
  p_watched_on date,
  p_tmdb_id bigint default null,
  p_poster_path text default null,
  p_release_date date default null,
  p_runtime integer default null,
  p_genres text[] default '{}',
  p_overview text default null,
  p_note text default null
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_note text := nullif(
    regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
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

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
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
    watched_on,
    personal_note
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
    p_watched_on,
    v_note
  )
  returning * into v_event;

  return v_event;
end;
$$;

drop function if exists public.update_user_watch_event(uuid, text, date, date, text);

-- p_note cannot tell "left out" from "cleared", and a client from before this
-- migration leaves it out when editing a drawn entry. Without the flag that
-- client would erase a comment it has never seen, so the comment is written
-- for every kind of entry only when the caller says it means to.
create function public.update_user_watch_event(
  p_event_id uuid,
  p_title text,
  p_watched_on date,
  p_release_date date default null,
  p_note text default null,
  p_set_personal_note boolean default false
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_note text := nullif(
    regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
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

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  update public.user_watch_events
  set title = v_title,
      watched_on = p_watched_on,
      release_date = p_release_date,
      personal_note = case
        when coalesce(p_set_personal_note, false) or source_kind = 'manual' then v_note
        else personal_note
      end,
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

-- The bowl page edits the comment in place and has no business rewriting the
-- title or date the person gave their entry, so it gets a call of its own.
create function public.update_own_watch_event_note(
  p_event_id uuid,
  p_note text
)
returns public.user_watch_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.user_watch_events%rowtype;
  v_note text := nullif(
    regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to edit watch history.'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  update public.user_watch_events
  set personal_note = v_note,
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

revoke all on function public.update_user_watch_event(uuid, text, date, date, text, boolean)
from public, anon, authenticated;

revoke all on function public.update_own_watch_event_note(uuid, text)
from public, anon, authenticated;

grant execute on function public.update_user_watch_event(uuid, text, date, date, text, boolean)
to authenticated;

grant execute on function public.update_own_watch_event_note(uuid, text)
to authenticated;

comment on column public.user_watch_events.note is
  'Why the movie was in the bowl: immutable snapshot of the slip comment. Always null on manual entries.';

comment on column public.user_watch_events.personal_note is
  'The watcher''s own comment on the entry. Private to them and editable on every entry kind.';

comment on function public.update_own_watch_event_note(uuid, text) is
  'Sets only the caller''s own comment on one of their own watch history entries.';

commit;

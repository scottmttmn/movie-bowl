-- Restores one comment per watch history entry: manual comments move back into
-- `note`, the update RPC loses its personal-comment flag, and the in-place
-- comment RPC is dropped.
--
-- A comment written on a bowl-draw or solo-draw entry has nowhere to go in the
-- old shape -- that entry's `note` is the slip's reason and stays so -- and is
-- deleted with the column. Roll back only alongside a client that no longer
-- offers those comments, and only if losing them is acceptable.

begin;

drop function if exists public.update_own_watch_event_note(uuid, text);

alter table public.user_watch_events
  drop constraint if exists user_watch_events_manual_has_no_bowl_note_check;

update public.user_watch_events
set note = personal_note
where source_kind = 'manual';

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
    note
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

drop function if exists public.update_user_watch_event(uuid, text, date, date, text, boolean);

create function public.update_user_watch_event(
  p_event_id uuid,
  p_title text,
  p_watched_on date,
  p_release_date date default null,
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
      note = case when source_kind = 'manual' then v_note else note end,
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

revoke all on function public.update_user_watch_event(uuid, text, date, date, text)
from public, anon, authenticated;

grant execute on function public.update_user_watch_event(uuid, text, date, date, text)
to authenticated;

alter table public.user_watch_events
  drop constraint if exists user_watch_events_personal_note_length_check;

alter table public.user_watch_events
  drop column if exists personal_note;

comment on column public.user_watch_events.note is
  'Manual comment or immutable personal snapshot of a bowl draw comment.';

commit;

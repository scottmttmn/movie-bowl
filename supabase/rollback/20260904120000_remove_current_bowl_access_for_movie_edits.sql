-- Restores update_own_bowl_movie_note and set_own_bowl_movie_pin to their
-- pre-fix definitions, which check row ownership, attribution, and undrawn
-- state but not current bowl access. Move this file into supabase/migrations/
-- with a fresh timestamp before applying it, and only roll back alongside a
-- deliberate decision to reopen the access gap this migration closed.

begin;

create or replace function public.update_own_bowl_movie_note(
  p_bowl_movie_id uuid,
  p_note text
)
returns public.bowl_movies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie public.bowl_movies%rowtype;
  v_note text := nullif(
    regexp_replace(coalesce(p_note, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'),
    ''
  );
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to edit a movie comment.'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  update public.bowl_movies
  set note = v_note
  where id = p_bowl_movie_id
    and added_by = auth.uid()
    and added_by_name is null
    and added_via_link_id is null
    and drawn_at is null
  returning * into v_movie;

  if not found then
    raise exception 'This movie comment is no longer available to edit.'
      using errcode = 'P0001';
  end if;

  return v_movie;
end;
$$;

create or replace function public.set_own_bowl_movie_pin(
  p_bowl_movie_id uuid,
  p_pinned boolean
)
returns public.bowl_movies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bowl_id uuid;
  v_movie public.bowl_movies%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to pin a movie.'
      using errcode = '42501';
  end if;

  select movie.bowl_id
  into v_bowl_id
  from public.bowl_movies movie
  where movie.id = p_bowl_movie_id
    and movie.added_by = auth.uid()
    and movie.added_by_name is null
    and movie.added_via_link_id is null
    and movie.drawn_at is null;

  if not found then
    raise exception 'This movie is no longer available to pin.'
      using errcode = 'P0001';
  end if;

  -- Draws already lock the bowl first. Taking the same lock serializes a pin
  -- move with a draw and prevents two tabs from clearing/setting in opposite
  -- row-lock order.
  perform 1
  from public.bowls bowl
  where bowl.id = v_bowl_id
  for update;

  select *
  into v_movie
  from public.bowl_movies movie
  where movie.id = p_bowl_movie_id
    and movie.added_by = auth.uid()
    and movie.added_by_name is null
    and movie.added_via_link_id is null
    and movie.drawn_at is null
  for update;

  if not found then
    raise exception 'This movie is no longer available to pin.'
      using errcode = 'P0001';
  end if;

  if coalesce(p_pinned, false) then
    update public.bowl_movies
    set is_pinned = false
    where bowl_id = v_movie.bowl_id
      and added_by = auth.uid()
      and drawn_at is null
      and is_pinned;
  end if;

  update public.bowl_movies
  set is_pinned = coalesce(p_pinned, false)
  where id = v_movie.id
  returning * into v_movie;

  return v_movie;
end;
$$;

comment on function public.update_own_bowl_movie_note(uuid, text) is
  'Updates only an authenticated contributor own undrawn non-link movie comment.';

comment on function public.set_own_bowl_movie_pin(uuid, boolean) is
  'Atomically moves or clears the signed-in contributor pin for one undrawn bowl movie.';

commit;

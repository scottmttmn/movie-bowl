-- A claimed starter-pack title used to be an ordinary title in every way,
-- deletion included, so claiming one and then deleting it took it out of the
-- bowl for everyone. Deleting a claimed title now puts it back in the pack it
-- came from, as long as that pack is still the bowl's installed one: the claim
-- was a loan from a shared pile, and giving it up returns it there.
--
-- The claim has to remember where it came from, because it clears
-- `starter_pack` and `added_by_name`. Rows claimed before this migration
-- carry no origin and delete outright, as they always have.
--
-- Deletion moves to `remove_own_bowl_movie`, the one path the app uses to
-- delete a title of your own. A trigger on DELETE was the alternative, but
-- a bowl deletion cascades through the same rows and must not be turned into
-- updates.

begin;

alter table public.bowl_movies
  add column claimed_from_starter_pack text,
  add column claimed_from_starter_pack_name text,
  add constraint bowl_movies_claimed_from_starter_pack_check
    check (
      (claimed_from_starter_pack is null) = (claimed_from_starter_pack_name is null)
      and (claimed_from_starter_pack is null or starter_pack is null)
    );

comment on column public.bowl_movies.claimed_from_starter_pack is
  'Slug of the starter pack this title was claimed from, so deleting it can return it there.';
comment on column public.bowl_movies.claimed_from_starter_pack_name is
  'The pack name the slip carried before it was claimed, restored if it is returned.';

create or replace function public.claim_bowl_starter_pack_movie(
  p_bowl_id uuid,
  p_tmdb_id bigint,
  p_note text default null
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
    raise exception 'You must be signed in to add a movie.'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Comment must be 500 characters or fewer.'
      using errcode = '22001';
  end if;

  if not (public.is_bowl_owner(p_bowl_id) or public.is_bowl_member(p_bowl_id)) then
    raise exception 'You no longer have access to this bowl.'
      using errcode = '42501';
  end if;

  -- Same lock order as a draw, so a claim and a draw of the same slip cannot
  -- both succeed.
  perform 1
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  select *
  into v_movie
  from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.tmdb_id = p_tmdb_id
    and movie.drawn_at is null
    and movie.starter_pack is not null
  for update;

  if not found then
    raise exception 'This movie is no longer in the starter pack.'
      using errcode = 'P0001';
  end if;

  update public.bowl_movies
  set added_by = auth.uid(),
      added_by_name = null,
      starter_pack = null,
      claimed_from_starter_pack = v_movie.starter_pack,
      claimed_from_starter_pack_name = v_movie.added_by_name,
      note = v_note,
      added_at = now()
  where id = v_movie.id
  returning * into v_movie;

  return v_movie;
end;
$$;

-- Deletes the caller's own undrawn title, or returns it to its pack. The
-- result says which, so the app can tell the person where it went.
create function public.remove_own_bowl_movie(
  p_bowl_id uuid,
  p_bowl_movie_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie public.bowl_movies%rowtype;
  v_installed text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to remove a movie.'
      using errcode = '42501';
  end if;

  if not (public.is_bowl_owner(p_bowl_id) or public.is_bowl_member(p_bowl_id)) then
    raise exception 'You no longer have access to this bowl.'
      using errcode = '42501';
  end if;

  -- Same lock order as a draw and a claim: a title being drawn cannot also be
  -- removed, and a pack being removed cannot also be returned to.
  select bowl.starter_pack
  into v_installed
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  select *
  into v_movie
  from public.bowl_movies movie
  where movie.id = p_bowl_movie_id
    and movie.bowl_id = p_bowl_id
    and movie.added_by = auth.uid()
    and movie.drawn_at is null
  for update;

  if not found then
    raise exception 'This movie is no longer available to remove.'
      using errcode = 'P0001';
  end if;

  -- The pack cap limits what an install pours in. A return is not an install:
  -- it puts back a slip that was already in the bowl, so it does not check it.
  if v_movie.claimed_from_starter_pack is not null
    and v_movie.claimed_from_starter_pack = v_installed then
    update public.bowl_movies
    set added_by = null,
        added_by_name = v_movie.claimed_from_starter_pack_name,
        starter_pack = v_movie.claimed_from_starter_pack,
        claimed_from_starter_pack = null,
        claimed_from_starter_pack_name = null,
        note = null,
        is_pinned = false,
        added_at = now()
    where id = v_movie.id
    returning * into v_movie;

    return jsonb_build_object(
      'id', v_movie.id,
      'returned_to_pack', true,
      'movie', to_jsonb(v_movie)
    );
  end if;

  delete from public.bowl_movies where id = v_movie.id;

  return jsonb_build_object('id', v_movie.id, 'returned_to_pack', false, 'movie', null);
end;
$$;

revoke all on function public.remove_own_bowl_movie(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.remove_own_bowl_movie(uuid, uuid)
to authenticated;

comment on function public.remove_own_bowl_movie(uuid, uuid) is
  'Deletes the signed-in member own undrawn title, or returns a claimed pack title to its still-installed pack.';

commit;

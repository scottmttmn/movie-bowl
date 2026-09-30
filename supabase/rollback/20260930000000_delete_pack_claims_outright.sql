-- Reverts 20260930000000_return_deleted_pack_claims.sql. Revert the client
-- first, so nothing calls remove_own_bowl_movie. Titles already returned to a
-- pack stay pack slips; claims made since keep no record of their origin.

begin;

drop function if exists public.remove_own_bowl_movie(uuid, uuid);

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
      note = v_note,
      added_at = now()
  where id = v_movie.id
  returning * into v_movie;

  return v_movie;
end;
$$;

alter table public.bowl_movies
  drop constraint if exists bowl_movies_claimed_from_starter_pack_check,
  drop column if exists claimed_from_starter_pack_name,
  drop column if exists claimed_from_starter_pack;

commit;

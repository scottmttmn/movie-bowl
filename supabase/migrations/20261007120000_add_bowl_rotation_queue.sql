-- Whose turn a rotation bowl is coming up on, for the people sheet
-- (output/designs/deterministic-draw-preview.md, step 2). It ranks the
-- eligible people exactly as draw_bowl_movie_by_rotation does -- never drawn
-- first, then least recently drawn, a draw's recorded turn before its slip's
-- contributor -- so the list cannot disagree with the next draw.
--
-- It is a readout, not a reservation. Nothing is locked or written, and the
-- draw ranks again inside its own lock, so two devices still cannot award the
-- same turn twice.
--
-- Like the draw's own queue it carries order and a never-drawn flag, never
-- dates: a date would surface a draw its owner removed from the bowl's
-- history. The client cannot rebuild the order itself for the same reason --
-- returned and removed draws still count for rotation and are hidden from
-- every watched list.
--
-- Where the draw breaks a tie at random, this breaks it by bucket key, so a
-- refresh does not shuffle the list. The only tie that happens in practice is
-- everyone never drawn, and never_drawn tells the caller that is a tie.
begin;

create function public.get_bowl_rotation_queue(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[]
)
returns table (
  bucket_key text,
  never_drawn boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to read a bowl.'
      using errcode = '42501';
  end if;

  if not (public.is_bowl_owner(p_bowl_id) or public.is_bowl_member(p_bowl_id)) then
    raise exception 'You do not have access to this bowl.'
      using errcode = '42501';
  end if;

  if cardinality(p_candidate_movie_ids) > 500 then
    raise exception 'Too many candidate movies were supplied.'
      using errcode = 'P0001';
  end if;

  return query
  with candidate_buckets as (
    select distinct public._bowl_contributor_bucket_key(
      movie.added_by, movie.added_by_name, movie.starter_pack
    ) as bucket_key
    from public.bowl_movies movie
    join public.bowls bowl on bowl.id = movie.bowl_id
    where movie.bowl_id = p_bowl_id
      and bowl.draw_method = 'rotation'
      and movie.drawn_at is null
      and movie.starter_pack is null
      and movie.id = any(coalesce(p_candidate_movie_ids, array[]::uuid[]))
  ),
  history_by_bucket as (
    select
      coalesce(
        event.turn_bucket_key,
        public._bowl_contributor_bucket_key(
          event.added_by, event.added_by_name, event.starter_pack
        )
      ) as bucket_key,
      max(event.drawn_at) as last_drawn_at
    from public.bowl_draw_events event
    where event.bowl_id = p_bowl_id
      and (event.turn_bucket_key is not null or event.starter_pack is null)
    group by 1
  )
  select
    candidate.bucket_key,
    history.last_drawn_at is null
  from candidate_buckets candidate
  left join history_by_bucket history using (bucket_key)
  order by history.last_drawn_at asc nulls first, candidate.bucket_key;
end;
$$;

revoke all on function public.get_bowl_rotation_queue(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.get_bowl_rotation_queue(uuid, uuid[])
to authenticated;

comment on function public.get_bowl_rotation_queue(uuid, uuid[]) is
  'Read-only: the eligible people of a rotation bowl in the order its next draw would rank them, with a never-drawn flag and no dates; empty for any other draw method.';

commit;

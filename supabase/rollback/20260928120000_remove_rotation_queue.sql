-- Revert the rotation queue. Move this file into supabase/migrations/ with a
-- fresh timestamp to run it. The function returns to its three-column result,
-- taken verbatim from 20260924120000_add_starter_packs.sql, which clients that
-- still read the queue survive: they fall back to stepping the drawn person
-- forward without lining anyone up.

begin;

drop function if exists public.draw_bowl_movie_by_rotation(uuid, uuid[], text);

-- From 20260924120000_add_starter_packs.sql.
create function public.draw_bowl_movie_by_rotation(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[],
  p_watched_timezone text
)
returns table (
  bowl_movie_id uuid,
  draw_event_id uuid,
  drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_method text;
  v_turn_bucket_key text;
  v_selected_movie_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to draw from a bowl.'
      using errcode = '42501';
  end if;

  if coalesce(cardinality(p_candidate_movie_ids), 0) = 0 then
    raise exception 'No eligible movies are available for this rotation draw.'
      using errcode = 'P0001';
  end if;

  if cardinality(p_candidate_movie_ids) > 500 then
    raise exception 'Too many candidate movies were supplied.'
      using errcode = 'P0001';
  end if;

  select bowl.draw_method
  into v_draw_method
  from public.bowls bowl
  where bowl.id = p_bowl_id
  for update;

  if not found then
    raise exception 'This bowl is no longer available.'
      using errcode = 'P0001';
  end if;

  if not public.can_draw_from_bowl(p_bowl_id) then
    raise exception 'You do not have permission to draw in this bowl.'
      using errcode = '42501';
  end if;

  if v_draw_method <> 'rotation' then
    raise exception 'This bowl is not using rotation.'
      using errcode = 'P0001';
  end if;

  with candidate_buckets as (
    select distinct public._bowl_contributor_bucket_key(
      movie.added_by, movie.added_by_name, movie.starter_pack
    ) as bucket_key
    from public.bowl_movies movie
    where movie.bowl_id = p_bowl_id
      and movie.drawn_at is null
      and movie.starter_pack is null
      and movie.id = any(p_candidate_movie_ids)
  ),
  -- A draw's turn is the one it recorded, else its slip's contributor. A pack
  -- draw that recorded no turn spent nobody's, and counts for no one.
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
  select candidate.bucket_key
  into v_turn_bucket_key
  from candidate_buckets candidate
  left join history_by_bucket history using (bucket_key)
  order by history.last_drawn_at asc nulls first, random()
  limit 1;

  select movie.id
  into v_selected_movie_id
  from public.bowl_movies movie
  where movie.bowl_id = p_bowl_id
    and movie.drawn_at is null
    and movie.id = any(p_candidate_movie_ids)
    and (
      movie.starter_pack is not null
      or public._bowl_contributor_bucket_key(
        movie.added_by, movie.added_by_name, movie.starter_pack
      ) = v_turn_bucket_key
    )
  order by movie.is_pinned desc, random()
  limit 1;

  if v_selected_movie_id is null then
    raise exception 'The eligible rotation pool is stale. Please try again.'
      using errcode = 'P0001';
  end if;

  return query
  select
    v_selected_movie_id,
    recorded.draw_event_id,
    recorded.drawn_at
  from public._record_bowl_movie_draw(
    v_selected_movie_id,
    p_watched_timezone,
    v_turn_bucket_key
  ) recorded;
end;
$$;

revoke all on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
from public, anon, authenticated;
grant execute on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text)
to authenticated;

comment on function public.draw_bowl_movie_by_rotation(uuid, uuid[], text) is
  'Atomically selects and records a rotation draw; starter pack slips join every contributor pile and never take a turn.';

commit;

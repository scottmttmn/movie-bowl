-- Rotation draws say which turn they spent and the queue they chose it from
-- (output/designs/draw-method-reveals.md). The reveal lines the eligible
-- people up in that order before the drawn person steps forward, and it can
-- only do that truthfully with the order the locked transaction actually used:
-- the client cannot rebuild it, because returned and removed draws still count
-- for rotation and are hidden from every watched list.
--
-- The queue carries order and a never-drawn flag, never dates. A date would
-- surface a draw its owner removed from the bowl's history. Ties keep the
-- random order the draw broke them in, so the first entry is always the turn
-- spent.
--
-- Adding columns to a function's result means replacing it. Older clients read
-- `bowl_movie_id` from the first row and ignore the rest, so the call is
-- unchanged for them.

begin;

drop function if exists public.draw_bowl_movie_by_rotation(uuid, uuid[], text);

create function public.draw_bowl_movie_by_rotation(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[],
  p_watched_timezone text
)
returns table (
  bowl_movie_id uuid,
  draw_event_id uuid,
  drawn_at timestamptz,
  turn_bucket_key text,
  rotation_queue jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draw_method text;
  v_turn_bucket_key text;
  v_rotation_queue jsonb;
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
  ),
  -- One ranking, so the turn and the queue cannot disagree about a tie.
  ranked as (
    select
      candidate.bucket_key,
      history.last_drawn_at,
      row_number() over (order by history.last_drawn_at asc nulls first, random()) as queue_position
    from candidate_buckets candidate
    left join history_by_bucket history using (bucket_key)
  )
  select
    (array_agg(ranked.bucket_key order by ranked.queue_position))[1],
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket_key', ranked.bucket_key,
          'never_drawn', ranked.last_drawn_at is null
        )
        order by ranked.queue_position
      ),
      '[]'::jsonb
    )
  into v_turn_bucket_key, v_rotation_queue
  from ranked;

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
    recorded.drawn_at,
    v_turn_bucket_key,
    v_rotation_queue
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
  'Atomically selects and records a rotation draw, returning the turn spent and the eligible queue in the order it was ranked; starter pack slips join every contributor pile and never take a turn.';

commit;

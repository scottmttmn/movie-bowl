-- Promote queued movies when contribution rules change and allow full eligible drain.

drop function if exists public.promote_queued_movies_for_bowl(uuid);
create function public.promote_queued_movies_for_bowl(p_bowl_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoted_count integer := 0;
  v_promoted_this_pass integer := 0;
  v_user_id uuid;
  v_queue_row public.bowl_movie_queue%rowtype;
begin
  loop
    v_promoted_this_pass := 0;

    for v_user_id in
      select q.queued_by
      from public.bowl_movie_queue q
      where q.bowl_id = p_bowl_id
        and q.promoted_at is null
        and q.removed_at is null
      group by q.queued_by
      order by min(q.queued_at)
    loop
      if not public.queue_user_is_eligible(p_bowl_id, v_user_id) then
        continue;
      end if;

      select q.*
      into v_queue_row
      from public.bowl_movie_queue q
      where q.bowl_id = p_bowl_id
        and q.queued_by = v_user_id
        and q.promoted_at is null
        and q.removed_at is null
      order by q.queued_at asc
      limit 1
      for update skip locked;

      if v_queue_row.id is null then
        continue;
      end if;

      insert into public.bowl_movies (
        bowl_id,
        added_by,
        tmdb_id,
        title,
        poster_path,
        release_date,
        runtime,
        genres,
        overview,
        snapshot_at
      )
      values (
        v_queue_row.bowl_id,
        v_queue_row.queued_by,
        v_queue_row.tmdb_id,
        v_queue_row.title,
        v_queue_row.poster_path,
        v_queue_row.release_date,
        v_queue_row.runtime,
        coalesce(v_queue_row.genres, '{}'),
        v_queue_row.overview,
        v_queue_row.snapshot_at
      );

      update public.bowl_movie_queue q
      set promoted_at = now()
      where q.id = v_queue_row.id
        and q.promoted_at is null
        and q.removed_at is null;

      v_promoted_count := v_promoted_count + 1;
      v_promoted_this_pass := v_promoted_this_pass + 1;
      v_queue_row := null;
    end loop;

    exit when v_promoted_this_pass = 0;
  end loop;

  return v_promoted_count;
end;
$$;

drop function if exists public.trigger_promote_queued_movies_on_bowl_update();
create function public.trigger_promote_queued_movies_on_bowl_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.max_contribution_lead is distinct from old.max_contribution_lead then
    perform public.promote_queued_movies_for_bowl(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists promote_queued_movies_after_bowl_meta_change on public.bowls;
create trigger promote_queued_movies_after_bowl_meta_change
after update of max_contribution_lead on public.bowls
for each row
execute function public.trigger_promote_queued_movies_on_bowl_update();

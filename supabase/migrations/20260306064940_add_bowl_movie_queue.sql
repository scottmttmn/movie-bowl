-- Queue movies that cannot be added due to contribution lead limits.
-- Auto-promote queued rows into bowl_movies when users become eligible.

create table if not exists public.bowl_movie_queue (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  queued_by uuid not null references public.profiles(id) on delete cascade,
  tmdb_id bigint,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[] not null default '{}',
  overview text,
  snapshot_at timestamptz,
  queued_at timestamptz not null default now(),
  promoted_at timestamptz,
  removed_at timestamptz
);

create index if not exists bowl_movie_queue_bowl_user_pending_idx
  on public.bowl_movie_queue (bowl_id, queued_by, queued_at)
  where promoted_at is null and removed_at is null;

create index if not exists bowl_movie_queue_bowl_user_promoted_idx
  on public.bowl_movie_queue (bowl_id, queued_by, promoted_at desc)
  where promoted_at is not null and removed_at is null;

alter table public.bowl_movie_queue enable row level security;

drop policy if exists "Queue members can insert own rows" on public.bowl_movie_queue;
create policy "Queue members can insert own rows"
on public.bowl_movie_queue
for insert
to authenticated
with check (
  queued_by = auth.uid()
  and (
    exists (
      select 1
      from public.bowls b
      where b.id = bowl_movie_queue.bowl_id
        and b.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.bowl_members bm
      where bm.bowl_id = bowl_movie_queue.bowl_id
        and bm.user_id = auth.uid()
    )
  )
);

drop policy if exists "Queue users can view own rows" on public.bowl_movie_queue;
create policy "Queue users can view own rows"
on public.bowl_movie_queue
for select
to authenticated
using (
  queued_by = auth.uid()
  and removed_at is null
);

drop policy if exists "Queue users can update own pending rows" on public.bowl_movie_queue;
create policy "Queue users can update own pending rows"
on public.bowl_movie_queue
for update
to authenticated
using (
  queued_by = auth.uid()
  and promoted_at is null
  and removed_at is null
)
with check (
  queued_by = auth.uid()
);

drop policy if exists "Queue users can delete own pending rows" on public.bowl_movie_queue;
create policy "Queue users can delete own pending rows"
on public.bowl_movie_queue
for delete
to authenticated
using (
  queued_by = auth.uid()
  and promoted_at is null
  and removed_at is null
);

drop function if exists public.queue_user_is_eligible(uuid, uuid);
create function public.queue_user_is_eligible(p_bowl_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_lead integer;
  v_my_count integer := 0;
  v_min_count integer := 0;
begin
  select b.max_contribution_lead
  into v_max_lead
  from public.bowls b
  where b.id = p_bowl_id;

  if v_max_lead is null or v_max_lead < 1 then
    return true;
  end if;

  with active_members as (
    select b.owner_id as user_id
    from public.bowls b
    where b.id = p_bowl_id
    union
    select bm.user_id
    from public.bowl_members bm
    where bm.bowl_id = p_bowl_id
  ),
  contribution_counts as (
    select
      am.user_id,
      coalesce(count(m.id), 0)::integer as total_added
    from active_members am
    left join public.bowl_movies m
      on m.bowl_id = p_bowl_id
      and m.added_by = am.user_id
    group by am.user_id
  )
  select
    coalesce(max(case when cc.user_id = p_user_id then cc.total_added end), 0),
    coalesce(min(cc.total_added), 0)
  into v_my_count, v_min_count
  from contribution_counts cc;

  return (v_my_count - v_min_count) < v_max_lead;
end;
$$;

drop function if exists public.promote_queued_movies_for_bowl(uuid);
create function public.promote_queued_movies_for_bowl(p_bowl_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_promoted_count integer := 0;
  v_user_id uuid;
  v_queue_row public.bowl_movie_queue%rowtype;
begin
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
  end loop;

  return v_promoted_count;
end;
$$;

drop function if exists public.trigger_promote_queued_movies();
create function public.trigger_promote_queued_movies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bowl_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  v_bowl_id := coalesce(new.bowl_id, old.bowl_id);
  if v_bowl_id is not null then
    perform public.promote_queued_movies_for_bowl(v_bowl_id);
  end if;
  return null;
end;
$$;

drop trigger if exists promote_queued_movies_after_bowl_movie_change on public.bowl_movies;
create trigger promote_queued_movies_after_bowl_movie_change
after insert or delete on public.bowl_movies
for each row
execute function public.trigger_promote_queued_movies();

drop function if exists public.refresh_bowl_queue_promotions(uuid);
create function public.refresh_bowl_queue_promotions(p_bowl_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.bowls b
    where b.id = p_bowl_id
      and (
        b.owner_id = auth.uid()
        or exists (
          select 1
          from public.bowl_members bm
          where bm.bowl_id = p_bowl_id
            and bm.user_id = auth.uid()
        )
      )
  ) then
    raise exception 'Not a bowl member';
  end if;

  return public.promote_queued_movies_for_bowl(p_bowl_id);
end;
$$;

alter table public.bowls
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_bowls_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_bowls_updated_at on public.bowls;
create trigger touch_bowls_updated_at
before update on public.bowls
for each row
execute function public.touch_bowls_updated_at();

drop function if exists public.get_my_bowls_with_counts();
create function public.get_my_bowls_with_counts()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  remaining_count bigint,
  member_count bigint,
  last_activity_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with accessible_bowls as (
    select
      b.id,
      b.name,
      b.owner_id,
      b.created_at,
      b.updated_at
    from public.bowls b
    where b.owner_id = auth.uid()
      or exists (
        select 1
        from public.bowl_members bm
        where bm.bowl_id = b.id
          and bm.user_id = auth.uid()
      )
  ),
  movie_stats as (
    select
      m.bowl_id,
      count(*) filter (where m.drawn_at is null)::bigint as remaining_count,
      max(
        greatest(
          coalesce(m.added_at, '-infinity'::timestamptz),
          coalesce(m.drawn_at, '-infinity'::timestamptz)
        )
      ) as latest_movie_activity_at
    from public.bowl_movies m
    join accessible_bowls ab on ab.id = m.bowl_id
    group by m.bowl_id
  ),
  member_users as (
    select ab.id as bowl_id, ab.owner_id as user_id
    from accessible_bowls ab
    where ab.owner_id is not null

    union

    select bm.bowl_id, bm.user_id
    from public.bowl_members bm
    join accessible_bowls ab on ab.id = bm.bowl_id
    where bm.user_id is not null
  ),
  member_stats as (
    select
      mu.bowl_id,
      count(distinct mu.user_id)::bigint as member_count
    from member_users mu
    group by mu.bowl_id
  )
  select
    ab.id,
    ab.name,
    ab.owner_id,
    coalesce(ms.remaining_count, 0)::bigint as remaining_count,
    coalesce(mbs.member_count, 0)::bigint as member_count,
    nullif(
      greatest(
        coalesce(ms.latest_movie_activity_at, '-infinity'::timestamptz),
        coalesce(ab.updated_at, '-infinity'::timestamptz),
        coalesce(ab.created_at, '-infinity'::timestamptz)
      ),
      '-infinity'::timestamptz
    ) as last_activity_at
  from accessible_bowls ab
  left join movie_stats ms on ms.bowl_id = ab.id
  left join member_stats mbs on mbs.bowl_id = ab.id
  order by last_activity_at desc nulls last, ab.name asc;
$$;

grant execute on function public.get_my_bowls_with_counts() to authenticated, anon, service_role;

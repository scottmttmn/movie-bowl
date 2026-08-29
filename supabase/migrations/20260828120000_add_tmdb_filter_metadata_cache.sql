begin;

create table public.tmdb_filter_metadata (
  tmdb_id bigint not null check (tmdb_id > 0),
  region text not null check (region ~ '^[A-Z]{2}$'),
  certification text check (
    certification is null
    or certification in ('G', 'PG', 'PG-13', 'R', 'NC-17')
  ),
  providers text[] not null default '{}',
  fetched_at timestamptz,
  refresh_started_at timestamptz,
  refresh_token uuid,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  retry_after timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, region),
  check (
    (refresh_started_at is null and refresh_token is null)
    or (refresh_started_at is not null and refresh_token is not null)
  )
);

alter table public.tmdb_filter_metadata enable row level security;

revoke all on table public.tmdb_filter_metadata from public, anon, authenticated;
grant select, insert, update, delete on table public.tmdb_filter_metadata to service_role;

create index tmdb_filter_metadata_refresh_queue_idx
on public.tmdb_filter_metadata (fetched_at nulls first, retry_after nulls first)
where refresh_started_at is null;

insert into public.tmdb_filter_metadata (tmdb_id, region)
select distinct tmdb_id, 'US'
from public.bowl_active_tmdb_movies
on conflict (tmdb_id, region) do nothing;

create or replace function public.seed_tmdb_filter_metadata_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tmdb_filter_metadata (tmdb_id, region)
  values (new.tmdb_id, 'US')
  on conflict (tmdb_id, region) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_tmdb_filter_metadata_cache()
from public, anon, authenticated;

create trigger seed_tmdb_filter_metadata_cache_after_insert
after insert on public.bowl_active_tmdb_movies
for each row
execute function public.seed_tmdb_filter_metadata_cache();

create or replace function public.prune_tmdb_filter_metadata_cache()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tmdb_filter_metadata metadata
  where metadata.tmdb_id = old.tmdb_id
    and not exists (
      select 1
      from public.bowl_active_tmdb_movies active
      where active.tmdb_id = old.tmdb_id
    );
  return old;
end;
$$;

revoke all on function public.prune_tmdb_filter_metadata_cache()
from public, anon, authenticated;

create trigger prune_tmdb_filter_metadata_cache_after_delete
after delete on public.bowl_active_tmdb_movies
for each row
execute function public.prune_tmdb_filter_metadata_cache();

create or replace function public.get_bowl_filter_metadata(
  p_bowl_id uuid,
  p_region text default 'US'
)
returns table (
  tmdb_id bigint,
  region text,
  certification text,
  providers text[],
  fetched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.bowls bowl
    where bowl.id = p_bowl_id
      and (
        bowl.owner_id = auth.uid()
        or exists (
          select 1
          from public.bowl_members member
          where member.bowl_id = bowl.id
            and member.user_id = auth.uid()
        )
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You do not have access to this bowl metadata.';
  end if;

  return query
  select
    active.tmdb_id,
    upper(p_region)::text,
    metadata.certification,
    coalesce(metadata.providers, '{}')::text[],
    metadata.fetched_at
  from public.bowl_active_tmdb_movies active
  left join public.tmdb_filter_metadata metadata
    on metadata.tmdb_id = active.tmdb_id
   and metadata.region = upper(p_region)
  where active.bowl_id = p_bowl_id
  order by active.tmdb_id;
end;
$$;

revoke all on function public.get_bowl_filter_metadata(uuid, text)
from public, anon;
grant execute on function public.get_bowl_filter_metadata(uuid, text)
to authenticated;

create or replace function public.claim_tmdb_filter_metadata_refreshes(
  p_limit integer,
  p_region text,
  p_stale_before timestamptz,
  p_tmdb_id bigint,
  p_bowl_id uuid,
  p_user_id uuid
)
returns table (
  tmdb_id bigint,
  region text,
  refresh_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- TMDB permits caching for at most six months. A missing fetched_at keeps the
  -- queue row while removing the expired TMDB-derived values.
  update public.tmdb_filter_metadata metadata
  set
    certification = null,
    providers = '{}',
    fetched_at = null,
    updated_at = now()
  where metadata.fetched_at < now() - interval '6 months';

  return query
  with candidates as (
    select metadata.tmdb_id, metadata.region
    from public.tmdb_filter_metadata metadata
    where metadata.region = upper(p_region)
      and (p_tmdb_id is null or metadata.tmdb_id = p_tmdb_id)
      and (
        metadata.fetched_at is null
        or metadata.fetched_at < p_stale_before
      )
      and (metadata.retry_after is null or metadata.retry_after <= now())
      and (
        metadata.refresh_started_at is null
        or metadata.refresh_started_at < now() - interval '15 minutes'
      )
      and exists (
        select 1
        from public.bowl_active_tmdb_movies active
        where active.tmdb_id = metadata.tmdb_id
          and (p_bowl_id is null or active.bowl_id = p_bowl_id)
      )
      and (
        p_user_id is null
        or (
          p_bowl_id is not null
          and exists (
            select 1
            from public.bowls bowl
            where bowl.id = p_bowl_id
              and (
                bowl.owner_id = p_user_id
                or exists (
                  select 1
                  from public.bowl_members member
                  where member.bowl_id = bowl.id
                    and member.user_id = p_user_id
                )
              )
          )
        )
      )
    order by metadata.fetched_at nulls first, metadata.updated_at
    for update of metadata skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 100))
  ),
  claimed as (
    update public.tmdb_filter_metadata metadata
    set
      refresh_started_at = now(),
      refresh_token = gen_random_uuid(),
      updated_at = now()
    from candidates
    where metadata.tmdb_id = candidates.tmdb_id
      and metadata.region = candidates.region
    returning metadata.tmdb_id, metadata.region, metadata.refresh_token
  )
  select claimed.tmdb_id, claimed.region, claimed.refresh_token
  from claimed;
end;
$$;

revoke all on function public.claim_tmdb_filter_metadata_refreshes(
  integer, text, timestamptz, bigint, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.claim_tmdb_filter_metadata_refreshes(
  integer, text, timestamptz, bigint, uuid, uuid
) to service_role;

create or replace function public.complete_tmdb_filter_metadata_refresh(
  p_tmdb_id bigint,
  p_region text,
  p_refresh_token uuid,
  p_certification text,
  p_providers text[],
  p_fetched_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tmdb_filter_metadata
  set
    certification = upper(nullif(trim(p_certification), '')),
    providers = coalesce(p_providers, '{}'),
    fetched_at = coalesce(p_fetched_at, now()),
    refresh_started_at = null,
    refresh_token = null,
    consecutive_failures = 0,
    retry_after = null,
    last_error = null,
    updated_at = now()
  where tmdb_id = p_tmdb_id
    and region = upper(p_region)
    and refresh_token = p_refresh_token;

  return found;
end;
$$;

revoke all on function public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text, text[], timestamptz
) to service_role;

create or replace function public.fail_tmdb_filter_metadata_refresh(
  p_tmdb_id bigint,
  p_region text,
  p_refresh_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tmdb_filter_metadata
  set
    certification = case
      when fetched_at < now() - interval '6 months' then null
      else certification
    end,
    providers = case
      when fetched_at < now() - interval '6 months' then '{}'
      else providers
    end,
    fetched_at = case
      when fetched_at < now() - interval '6 months' then null
      else fetched_at
    end,
    refresh_started_at = null,
    refresh_token = null,
    consecutive_failures = consecutive_failures + 1,
    retry_after = now() + make_interval(
      mins => least(1440, (5 * power(2, least(consecutive_failures, 8)))::integer)
    ),
    last_error = left(coalesce(p_error, 'Unknown refresh failure'), 500),
    updated_at = now()
  where tmdb_id = p_tmdb_id
    and region = upper(p_region)
    and refresh_token = p_refresh_token;

  return found;
end;
$$;

revoke all on function public.fail_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.fail_tmdb_filter_metadata_refresh(
  bigint, text, uuid, text
) to service_role;

commit;

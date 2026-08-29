begin;

create table public.tmdb_filter_metadata_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  region text not null check (region ~ '^[A-Z]{2}$'),
  status text not null check (status in ('completed', 'failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  claimed integer not null check (claimed >= 0),
  succeeded integer not null check (succeeded >= 0),
  failed integer not null check (failed >= 0),
  exhausted boolean,
  elapsed_ms integer not null check (elapsed_ms >= 0),
  remaining_stale integer not null check (remaining_stale >= 0),
  error text,
  created_at timestamptz not null default now(),
  check (completed_at >= started_at),
  check (succeeded + failed <= claimed),
  check (
    (status = 'completed' and exhausted is not null and error is null)
    or (status = 'failed' and exhausted is null and error is not null)
  )
);

alter table public.tmdb_filter_metadata_refresh_runs enable row level security;

revoke all on table public.tmdb_filter_metadata_refresh_runs
from public, anon, authenticated;
grant select on table public.tmdb_filter_metadata_refresh_runs to service_role;

create index tmdb_filter_metadata_refresh_runs_completed_at_idx
on public.tmdb_filter_metadata_refresh_runs (completed_at desc);

create or replace function public.record_tmdb_filter_metadata_refresh_run(
  p_region text,
  p_status text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_claimed integer,
  p_succeeded integer,
  p_failed integer,
  p_exhausted boolean,
  p_elapsed_ms integer,
  p_error text
)
returns table (
  run_id uuid,
  remaining_stale integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_remaining_stale integer;
begin
  delete from public.tmdb_filter_metadata_refresh_runs
  where completed_at < now() - interval '90 days';

  select count(*)::integer
  into v_remaining_stale
  from public.tmdb_filter_metadata metadata
  where metadata.region = upper(p_region)
    and (
      metadata.fetched_at is null
      or metadata.fetched_at < now() - interval '24 hours'
    )
    and exists (
      select 1
      from public.bowl_active_tmdb_movies active
      where active.tmdb_id = metadata.tmdb_id
    );

  insert into public.tmdb_filter_metadata_refresh_runs (
    region,
    status,
    started_at,
    completed_at,
    claimed,
    succeeded,
    failed,
    exhausted,
    elapsed_ms,
    remaining_stale,
    error
  ) values (
    upper(p_region),
    p_status,
    p_started_at,
    p_completed_at,
    p_claimed,
    p_succeeded,
    p_failed,
    p_exhausted,
    p_elapsed_ms,
    v_remaining_stale,
    case when p_error is null then null else left(p_error, 500) end
  )
  returning id into v_run_id;

  return query
  select v_run_id, v_remaining_stale;
end;
$$;

revoke all on function public.record_tmdb_filter_metadata_refresh_run(
  text, text, timestamptz, timestamptz, integer, integer, integer, boolean,
  integer, text
) from public, anon, authenticated;
grant execute on function public.record_tmdb_filter_metadata_refresh_run(
  text, text, timestamptz, timestamptz, integer, integer, integer, boolean,
  integer, text
) to service_role;

commit;

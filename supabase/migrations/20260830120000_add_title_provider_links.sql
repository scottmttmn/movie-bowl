begin;

create table public.title_provider_links (
  tmdb_id bigint not null check (tmdb_id > 0),
  region text not null check (region = 'US'),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  fetched_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  retry_after timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, region)
);

create table public.title_provider_link_usage (
  usage_month date not null,
  region text not null check (region = 'US'),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_month, region)
);

alter table public.title_provider_links enable row level security;
alter table public.title_provider_link_usage enable row level security;
revoke all on public.title_provider_links, public.title_provider_link_usage from public, anon, authenticated;
grant select, insert, update, delete on public.title_provider_links, public.title_provider_link_usage to service_role;

create function public.begin_title_provider_link_fetch(
  p_tmdb_id bigint,
  p_region text,
  p_bowl_id uuid,
  p_user_id uuid,
  p_monthly_budget integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cached public.title_provider_links%rowtype;
  usage_count integer;
  month_start date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_tmdb_id is null or p_tmdb_id <= 0 or p_region is distinct from 'US' then
    raise exception using errcode = '22023', message = 'Invalid provider lookup';
  end if;
  if p_user_id is null or not exists (
    select 1 from public.bowls bowl
    where bowl.id = p_bowl_id
      and (bowl.owner_id = p_user_id or exists (
        select 1 from public.bowl_members member
        where member.bowl_id = bowl.id and member.user_id = p_user_id
      ))
      -- Drawn slips remain eligible; the active registry drops them at draw time.
      and exists (
        select 1 from public.bowl_movies movie
        where movie.bowl_id = bowl.id and movie.tmdb_id = p_tmdb_id
      )
  ) then
    raise exception using errcode = '42501', message = 'Provider lookup not allowed';
  end if;

  insert into public.title_provider_links (tmdb_id, region)
  values (p_tmdb_id, p_region) on conflict do nothing;

  -- Expired vendor data must never escape through a budget or error fallback.
  update public.title_provider_links
  set links = '[]', fetched_at = null, updated_at = now()
  where tmdb_id = p_tmdb_id and region = p_region
    and fetched_at <= now() - interval '30 days';

  select * into cached from public.title_provider_links
  where tmdb_id = p_tmdb_id and region = p_region;
  if cached.fetched_at > now() - interval '30 days' then
    return jsonb_build_object('should_fetch', false, 'links', cached.links, 'fetched_at', cached.fetched_at);
  end if;
  if cached.retry_after > now() or coalesce(p_monthly_budget, 0) <= 0 then
    return jsonb_build_object('should_fetch', false, 'links', '[]'::jsonb);
  end if;

  -- This single upsert serializes the budget, including simultaneous misses
  -- for different titles. Counting before HTTP also counts interrupted fetches.
  insert into public.title_provider_link_usage (usage_month, region, request_count)
  values (month_start, p_region, 1)
  on conflict (usage_month, region) do update
    set request_count = public.title_provider_link_usage.request_count + 1
    where public.title_provider_link_usage.request_count < p_monthly_budget
  returning request_count into usage_count;

  return jsonb_build_object('should_fetch', usage_count is not null, 'links', '[]'::jsonb);
end;
$$;

create function public.complete_title_provider_link_fetch(p_tmdb_id bigint, p_region text, p_links jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_at timestamptz;
begin
  update public.title_provider_links
  set links = p_links, fetched_at = now(), consecutive_failures = 0,
    retry_after = null, last_error = null, updated_at = now()
  where tmdb_id = p_tmdb_id and region = p_region
  returning fetched_at into completed_at;
  return completed_at;
end;
$$;

create function public.fail_title_provider_link_fetch(p_tmdb_id bigint, p_region text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.title_provider_links
  set consecutive_failures = consecutive_failures + 1,
    retry_after = now() + make_interval(mins => least(1440, (5 * power(2, least(consecutive_failures, 9)))::integer)),
    last_error = left(coalesce(p_error, 'Provider lookup failed'), 200), updated_at = now()
  where tmdb_id = p_tmdb_id and region = p_region;
end;
$$;

create function public.prune_title_provider_links()
returns void
language sql
security definer
set search_path = ''
as $$
  -- The existing daily worker runs this even with lookups disabled. Removing
  -- at 29 days leaves one daily interval before the free plan's 30-day limit.
  delete from public.title_provider_links
  where fetched_at <= now() - interval '29 days';
$$;

revoke all on function public.begin_title_provider_link_fetch(bigint, text, uuid, uuid, integer),
  public.complete_title_provider_link_fetch(bigint, text, jsonb),
  public.fail_title_provider_link_fetch(bigint, text, text),
  public.prune_title_provider_links() from public, anon, authenticated;
grant execute on function public.begin_title_provider_link_fetch(bigint, text, uuid, uuid, integer),
  public.complete_title_provider_link_fetch(bigint, text, jsonb),
  public.fail_title_provider_link_fetch(bigint, text, text),
  public.prune_title_provider_links() to service_role;

commit;

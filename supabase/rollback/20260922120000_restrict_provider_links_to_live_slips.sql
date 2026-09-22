-- Restores the provider-link authorization check to live slips only, undoing
-- the clause that also accepts a copy a solo draw removed.
--
-- Running this makes a solo draw under "remove my copies" lose its title link
-- again: the reveal falls back to the service's search page and the theater
-- pre-roll stops opening the app. Nothing else regresses, and no cached vendor
-- data is touched.

begin;

create or replace function public.begin_title_provider_link_fetch(
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

commit;

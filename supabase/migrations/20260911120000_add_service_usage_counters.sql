-- Meters the vendor quotas the app spends, so a cost or capacity question can
-- be answered with a number instead of a guess.
--
-- Daily rather than monthly, unlike title_provider_link_usage. Watchmode's cap
-- is monthly, so a monthly row answers it exactly; the mail cap that actually
-- threatens this app is a daily one, and a monthly total cannot see a single
-- day's burst inside it. A month is the sum of its days, so daily rows answer
-- both questions and monthly rows answer only one.
begin;

create table public.service_usage_counters (
  usage_date date not null,
  -- Adding a metric means adding it here. The constraint is deliberate: a free
  -- text column turns one typo into a phantom metric that reads as zero usage
  -- forever, which is the failure this table exists to prevent.
  metric text not null check (metric in ('tmdb_request', 'invite_email')),
  event_count bigint not null default 0 check (event_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, metric)
);

alter table public.service_usage_counters enable row level security;

-- No role reaches this table directly, the service role included: writes go
-- through record_service_usage, and reading the numbers is an owner sitting in
-- the SQL editor, which does not run as any of these roles.
revoke all on table public.service_usage_counters from public, anon, authenticated, service_role;

-- Counts one or more spends of a metered vendor quota against today, UTC.
--
-- This records what happened; it never refuses. A meter that could reject the
-- action it measures would turn an observability gap into an outage, and the
-- vendors already enforce their own ceilings. Budgets that must hold belong in
-- a function like begin_title_provider_link_fetch, which reserves before HTTP.
create function public.record_service_usage(
  p_metric text,
  p_count integer default 1
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count bigint;
  today date := (now() at time zone 'UTC')::date;
begin
  if p_count is null or p_count <= 0 then
    return null;
  end if;

  insert into public.service_usage_counters (usage_date, metric, event_count)
  values (today, p_metric, p_count)
  on conflict (usage_date, metric) do update
    set event_count = public.service_usage_counters.event_count + p_count,
        updated_at = now()
  returning event_count into new_count;

  return new_count;
end;
$$;

revoke all on function public.record_service_usage(text, integer)
from public, anon, authenticated;
grant execute on function public.record_service_usage(text, integer) to service_role;

comment on table public.service_usage_counters is
  'Daily counts of metered vendor quota spend. No role reaches it directly; writes go through record_service_usage.';
comment on column public.service_usage_counters.metric is
  'Which vendor quota was spent. Extend the check constraint to add one.';
comment on function public.record_service_usage(text, integer) is
  'Records vendor quota spend against today (UTC). Never refuses the caller.';

commit;

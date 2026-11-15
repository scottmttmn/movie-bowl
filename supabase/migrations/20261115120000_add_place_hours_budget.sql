begin;

-- The restaurant bowl's Open filter asks Google for the opening hours of every
-- slip still in the bowl, so it can leave out the places closed at the time
-- the group means to eat. Hours alone bill at Google's Place Details Enterprise
-- rate, a different line from the drawn sheet's Enterprise + Atmosphere
-- request, each free for 1,000 a month. So hours get their own count: a busy
-- month of filtering cannot take the drawn sheet's links away, or the reverse.
alter table public.place_details_usage
  drop constraint place_details_usage_sku_check;
alter table public.place_details_usage
  add constraint place_details_usage_sku_check check (sku in ('details', 'photo', 'hours'));

-- Reserves hours lookups for p_user_id filtering p_bowl_id. Answers the place
-- ids that may be asked about: those of p_place_ids the bowl still holds
-- undrawn, at most forty, and no more than the month has left. Null means the
-- caller cannot see that bowl, so the route is never a free proxy to Google;
-- an empty array means the month is spent or none of the places is in the
-- bowl. Nothing Google returns is kept; only the count is.
create function public.begin_place_hours_fetch(
  p_user_id uuid,
  p_bowl_id uuid,
  p_place_ids text[],
  p_monthly_budget integer
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[];
  used integer;
  granted integer;
  this_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_user_id is null or p_bowl_id is null or not exists (
    select 1
    from public.bowls b
    where b.id = p_bowl_id
      and b.kind = 'restaurants'
      and (b.owner_id = p_user_id or exists (
        select 1 from public.bowl_members m where m.bowl_id = b.id and m.user_id = p_user_id
      ))
  ) then
    return null;
  end if;

  select coalesce(array_agg(place_id order by place_id), '{}')
  into allowed
  from (
    select distinct s.place_id
    from public.bowl_movies s
    where s.bowl_id = p_bowl_id
      and s.drawn_at is null
      and s.place_id = any (coalesce(p_place_ids, '{}'))
    order by s.place_id
    limit 40
  ) held;

  if cardinality(allowed) = 0 or coalesce(p_monthly_budget, 0) <= 0 then
    return '{}';
  end if;

  -- The row lock serializes simultaneous requests against the same month.
  insert into public.place_details_usage (usage_month, sku, request_count)
  values (this_month, 'hours', 0)
  on conflict (usage_month, sku) do nothing;

  select request_count into used
  from public.place_details_usage
  where usage_month = this_month and sku = 'hours'
  for update;

  granted := greatest(0, least(cardinality(allowed), p_monthly_budget - used));
  if granted = 0 then
    return '{}';
  end if;

  update public.place_details_usage
  set request_count = used + granted
  where usage_month = this_month and sku = 'hours';

  return allowed[1:granted];
end;
$$;

revoke all on function public.begin_place_hours_fetch(uuid, uuid, text[], integer)
from public, anon, authenticated;
grant execute on function public.begin_place_hours_fetch(uuid, uuid, text[], integer) to service_role;

comment on function public.begin_place_hours_fetch(uuid, uuid, text[], integer) is
  'Checks the caller can see a restaurant bowl, then reserves one Google hours request per place it still holds, within the month.';

commit;

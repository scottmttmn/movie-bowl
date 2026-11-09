begin;

-- The drawn restaurant's sheet asks Google for the place's hours, phone,
-- website, whether it takes reservations and one photo. Those fields bill at
-- Google's Enterprise + Atmosphere rate and the photo at its own, each free for
-- 1,000 a month, and Google's console caps per day rather than per month. This
-- holds the monthly line: a request is reserved here before the vendor call,
-- and refused once the month's budget is spent.
--
-- Nothing Google returns is kept; only the count is.
create table public.place_details_usage (
  usage_month date not null,
  sku text not null check (sku in ('details', 'photo')),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (usage_month, sku)
);

alter table public.place_details_usage enable row level security;

-- Sealed: only begin_place_details_fetch writes it, and reading it is an owner
-- in the SQL editor.
revoke all on table public.place_details_usage from public, anon, authenticated, service_role;

-- Reserves one request of p_sku for p_user_id looking up p_place_id in
-- p_bowl_id. Answers 'ok' when the call may go ahead, 'denied' when the caller
-- cannot see that place in that bowl (so the route is never a free proxy to
-- Google), and 'over_budget' once the month is spent.
create function public.begin_place_details_fetch(
  p_user_id uuid,
  p_bowl_id uuid,
  p_place_id text,
  p_sku text,
  p_monthly_budget integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved integer;
  this_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_sku is null or p_sku not in ('details', 'photo') then
    raise exception 'Unknown place details sku.' using errcode = '22023';
  end if;

  if p_user_id is null or p_bowl_id is null or coalesce(p_place_id, '') = '' or not exists (
    select 1
    from public.bowls b
    where b.id = p_bowl_id
      and b.kind = 'restaurants'
      and (b.owner_id = p_user_id or exists (
        select 1 from public.bowl_members m where m.bowl_id = b.id and m.user_id = p_user_id
      ))
      and (
        exists (select 1 from public.bowl_movies s where s.bowl_id = b.id and s.place_id = p_place_id)
        or exists (
          select 1 from public.bowl_draw_events e
          where e.bowl_id = b.id and e.place_id = p_place_id and e.removed_at is null
        )
      )
  ) then
    return 'denied';
  end if;

  if coalesce(p_monthly_budget, 0) <= 0 then
    return 'over_budget';
  end if;

  -- One upsert serializes simultaneous requests against the same month.
  insert into public.place_details_usage (usage_month, sku, request_count)
  values (this_month, p_sku, 1)
  on conflict (usage_month, sku) do update
    set request_count = public.place_details_usage.request_count + 1
    where public.place_details_usage.request_count < p_monthly_budget
  returning request_count into reserved;

  return case when reserved is null then 'over_budget' else 'ok' end;
end;
$$;

revoke all on function public.begin_place_details_fetch(uuid, uuid, text, text, integer)
from public, anon, authenticated;
grant execute on function public.begin_place_details_fetch(uuid, uuid, text, text, integer) to service_role;

comment on table public.place_details_usage is
  'Monthly count of Google Place Details and photo requests. Sealed; written only by begin_place_details_fetch.';
comment on function public.begin_place_details_fetch(uuid, uuid, text, text, integer) is
  'Checks the caller can see the place in a restaurant bowl, then reserves one Google request against the month.';

commit;

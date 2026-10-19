begin;

create table public.title_departures (
  tmdb_id bigint not null check (tmdb_id > 0),
  region text not null default 'US' check (region = 'US'),
  departures jsonb not null default '[]' check (jsonb_typeof(departures) = 'array'),
  valid_until timestamptz,
  fetched_at timestamptz,
  fetch_token uuid,
  retry_after timestamptz,
  primary key (tmdb_id, region)
);
create table public.title_departure_usage (
  usage_day date not null,
  user_id uuid not null,
  request_count integer not null check (request_count > 0),
  primary key (usage_day, user_id)
);
-- Usage survives account deletion so deleting an account cannot refund quota.
alter table public.title_departures enable row level security;
alter table public.title_departure_usage enable row level security;
revoke all on public.title_departures, public.title_departure_usage from public, anon, authenticated;
grant select, insert, update, delete on public.title_departures, public.title_departure_usage to service_role;

create function public.begin_title_departure_fetch(p_tmdb_id bigint, p_bowl_id uuid, p_user_id uuid, p_budget integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cached public.title_departures%rowtype;
  today date := (now() at time zone 'UTC')::date;
  token uuid;
begin
  if p_tmdb_id is null or p_tmdb_id <= 0 or p_budget is null or p_budget < 0 or p_budget > 900 then
    raise exception using errcode = '22023', message = 'Invalid departure lookup';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and cardinality(streaming_services) > 0) then
    raise exception using errcode = '42501', message = 'Departure lookup not allowed';
  end if;
  -- A search result cannot spend quota. The caller must own or belong to a
  -- bowl that still has this movie in its active registry (including packs).
  if not exists (
    select 1 from public.bowls b
    where b.id = p_bowl_id
      and (b.owner_id = p_user_id or exists (
        select 1 from public.bowl_members m where m.bowl_id = b.id and m.user_id = p_user_id
      ))
      and exists (
        select 1 from public.bowl_active_tmdb_movies a where a.bowl_id = b.id and a.tmdb_id = p_tmdb_id
      )
  ) then
    raise exception using errcode = '42501', message = 'Departure lookup not allowed';
  end if;
  -- Serializes quota reservation across titles and users, including cache misses.
  perform pg_catalog.pg_advisory_xact_lock(61019182452);
  select * into cached from public.title_departures where tmdb_id = p_tmdb_id and region = 'US';
  if cached.valid_until > now() then
    return jsonb_build_object('should_fetch', false, 'departures', cached.departures, 'valid_until', cached.valid_until);
  end if;
  if cached.retry_after > now() then
    return jsonb_build_object('should_fetch', false, 'departures', '[]'::jsonb);
  end if;
  -- Include 32 UTC dates: conservative across any 31-day billing window.
  if (select coalesce(sum(request_count), 0) from public.title_departure_usage where usage_day >= today - 31) >= p_budget
     or (select coalesce(sum(request_count), 0) from public.title_departure_usage where usage_day = today and user_id = p_user_id) >= 30 then
    return jsonb_build_object('should_fetch', false, 'departures', '[]'::jsonb);
  end if;
  insert into public.title_departure_usage (usage_day, user_id, request_count)
    values (today, p_user_id, 1)
    on conflict (usage_day, user_id) do update set request_count = public.title_departure_usage.request_count + 1;
  token := gen_random_uuid();
  insert into public.title_departures (tmdb_id, fetch_token, retry_after)
    values (p_tmdb_id, token, now() + interval '1 minute')
    on conflict (tmdb_id, region) do update set fetch_token = token, retry_after = now() + interval '1 minute', departures = '[]', valid_until = null;
  return jsonb_build_object('should_fetch', true, 'token', token);
end;
$$;

create function public.complete_title_departure_fetch(p_tmdb_id bigint, p_token uuid, p_departures jsonb)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare valid_until timestamptz;
begin
  if p_departures is null or jsonb_typeof(p_departures) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid departures';
  end if;
  update public.title_departures set
    departures = p_departures, fetched_at = now(), fetch_token = null, retry_after = null,
    valid_until = now() + case when jsonb_array_length(p_departures) > 0 then interval '1 day' else interval '7 days' end
    where tmdb_id = p_tmdb_id and region = 'US' and fetch_token = p_token
    returning title_departures.valid_until into valid_until;
  return valid_until;
end;
$$;

create function public.fail_title_departure_fetch(p_tmdb_id bigint, p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.title_departures set fetch_token = null, retry_after = now() + interval '1 hour'
    where tmdb_id = p_tmdb_id and region = 'US' and fetch_token = p_token;
$$;

create function public.prune_title_departures()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.title_departures where coalesce(valid_until, retry_after) < now() - interval '7 days';
  delete from public.title_departure_usage where usage_day < (now() at time zone 'UTC')::date - 31;
end;
$$;

revoke all on function public.begin_title_departure_fetch(bigint, uuid, uuid, integer),
  public.complete_title_departure_fetch(bigint, uuid, jsonb), public.fail_title_departure_fetch(bigint, uuid),
  public.prune_title_departures() from public, anon, authenticated;
grant execute on function public.begin_title_departure_fetch(bigint, uuid, uuid, integer),
  public.complete_title_departure_fetch(bigint, uuid, jsonb), public.fail_title_departure_fetch(bigint, uuid),
  public.prune_title_departures() to service_role;

commit;

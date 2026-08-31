begin;

create table public.user_bowl_defaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bowl_id uuid references public.bowls(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index user_bowl_defaults_bowl_id_idx on public.user_bowl_defaults (bowl_id);
alter table public.user_bowl_defaults enable row level security;
create policy user_bowl_defaults_select_own on public.user_bowl_defaults
  for select to authenticated using (user_id = auth.uid());
revoke all on public.user_bowl_defaults from public, anon, authenticated;
grant select on public.user_bowl_defaults to authenticated;

-- This query is also used during backfill and acquisition, without relying on
-- an owner membership row or the caller's profile having been created yet.
create function public._accessible_bowl_context(p_user_id uuid)
returns table (id uuid, name text, owner_id uuid, remaining_count bigint,
               member_count bigint, last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.owner_id,
    (select count(*) from public.bowl_movies m
     where m.bowl_id = b.id and m.drawn_at is null),
    (select count(*) from (
      select b.owner_id as user_id where b.owner_id is not null
      union select bm.user_id from public.bowl_members bm where bm.bowl_id = b.id
    ) members),
    greatest(b.created_at, b.updated_at,
      (select max(greatest(m.added_at, m.drawn_at))
       from public.bowl_movies m where m.bowl_id = b.id))
  from public.bowls b
  where b.owner_id = p_user_id or exists (
    select 1 from public.bowl_members bm
    where bm.bowl_id = b.id and bm.user_id = p_user_id
  );
$$;

create function public._ensure_user_bowl_default(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_bowl_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 8301));
  select d.bowl_id into v_bowl_id from public.user_bowl_defaults d
    where d.user_id = p_user_id;
  if v_bowl_id is not null and exists (
    select 1 from public.bowls b where b.id = v_bowl_id and
      (b.owner_id = p_user_id or exists (
        select 1 from public.bowl_members bm
        where bm.bowl_id = b.id and bm.user_id = p_user_id
      ))
  ) then
    return v_bowl_id;
  end if;

  select c.id into v_bowl_id from public._accessible_bowl_context(p_user_id) c
    order by c.remaining_count desc, lower(btrim(c.name)) collate "C", c.id limit 1;
  insert into public.user_bowl_defaults as d (user_id, bowl_id)
    values (p_user_id, v_bowl_id)
    on conflict (user_id) do update
      set bowl_id = excluded.bowl_id, updated_at = now()
      where d.bowl_id is distinct from excluded.bowl_id;
  return v_bowl_id;
end;
$$;

create function public.get_my_bowl_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_default uuid;
  v_bowls jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to load your bowls.' using errcode = '42501';
  end if;
  for attempt in 1..2 loop
    v_default := public._ensure_user_bowl_default(v_user_id);
    select coalesce(jsonb_agg(to_jsonb(c) order by c.last_activity_at desc nulls last, c.name, c.id), '[]'::jsonb)
      into v_bowls from public._accessible_bowl_context(v_user_id) c;
    if (v_default is null and jsonb_array_length(v_bowls) = 0)
      or exists (select 1 from jsonb_array_elements(v_bowls) c where c->>'id' = v_default::text) then
      return jsonb_build_object('default_bowl_id', v_default, 'bowls', v_bowls);
    end if;
  end loop;
  raise exception 'Your bowls changed. Please try again.' using errcode = '40001';
end;
$$;

create function public.set_my_default_bowl(p_bowl_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to change your default bowl.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 8301));
  if p_bowl_id is null or not exists (
    select 1 from public.bowls b where b.id = p_bowl_id and
      (b.owner_id = v_user_id or exists (
        select 1 from public.bowl_members bm
        where bm.bowl_id = b.id and bm.user_id = v_user_id
      ))
  ) then
    raise exception 'That bowl is no longer available.' using errcode = '42501';
  end if;
  insert into public.user_bowl_defaults as d (user_id, bowl_id)
    values (v_user_id, p_bowl_id)
    on conflict (user_id) do update set bowl_id = excluded.bowl_id, updated_at = now()
      where d.bowl_id is distinct from excluded.bowl_id;
  return public.get_my_bowl_context();
end;
$$;

create function public._initialize_acquired_bowl_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'bowls' then
    if new.owner_id is not null then
      perform public._ensure_user_bowl_default(new.owner_id);
    end if;
  else
    perform public._ensure_user_bowl_default(new.user_id);
  end if;
  return new;
end;
$$;

create trigger initialize_owned_bowl_default after insert or update of owner_id on public.bowls
  for each row execute function public._initialize_acquired_bowl_default();
create trigger initialize_joined_bowl_default after insert or update of user_id, bowl_id on public.bowl_members
  for each row execute function public._initialize_acquired_bowl_default();

revoke all on function public._accessible_bowl_context(uuid),
  public._ensure_user_bowl_default(uuid), public._initialize_acquired_bowl_default(),
  public.get_my_bowl_context(), public.set_my_default_bowl(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_bowl_context(), public.set_my_default_bowl(uuid) to authenticated;

-- Existing accounts use the same ranking as access-loss repair. The helper
-- preserves valid saved choices and includes accounts that only own bowls.
select public._ensure_user_bowl_default(u.id) from auth.users u order by u.id;

commit;

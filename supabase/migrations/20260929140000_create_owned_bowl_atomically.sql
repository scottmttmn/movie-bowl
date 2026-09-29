-- Creating a bowl was two client writes: insert the bowl, then its Owner
-- membership. A failure between them left a bowl with no owner membership and
-- reported the whole creation as failed, and because every attempt minted a new
-- bowl id, trying again after a lost response made a second bowl.
--
-- One transaction now does both, keyed on a bowl id the client generates once
-- per creation and keeps across retries. A repeat of the same id returns the
-- bowl that already exists (repairing a missing owner membership on the way)
-- instead of making another. The ten-bowl limit, until now only a UI check,
-- is enforced here too, serialized per owner so two tabs cannot both take the
-- last slot.
--
-- Security invoker: the existing policies already let an owner insert their
-- own bowl and their own membership, so nothing here needs to bypass RLS.

begin;

create or replace function public.create_owned_bowl(p_bowl_id uuid, p_name text)
returns public.bowls
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_bowl public.bowls%rowtype;
  v_owned_count integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a bowl.'
      using errcode = '42501';
  end if;

  if p_bowl_id is null then
    raise exception 'A bowl id is required.'
      using errcode = '22023';
  end if;

  if v_name is null then
    raise exception 'Bowl name is required.'
      using errcode = '22023';
  end if;

  -- Serializes one person's creations: the limit check and the insert must
  -- not interleave with another tab doing the same.
  perform pg_advisory_xact_lock(hashtextextended('create_owned_bowl:' || v_user_id::text, 0));

  select *
  into v_bowl
  from public.bowls
  where id = p_bowl_id
    and owner_id = v_user_id;

  if v_bowl.id is null then
    select count(*)::int
    into v_owned_count
    from public.bowls
    where owner_id = v_user_id;

    -- Mirrors MAX_BOWLS_PER_USER in src/utils/appLimits.js.
    if v_owned_count >= 10 then
      raise exception 'You can create up to 10 bowls.'
        using errcode = 'P0001', hint = 'limit_reached';
    end if;

    insert into public.bowls (id, owner_id, name)
    values (p_bowl_id, v_user_id, v_name)
    on conflict (id) do nothing
    returning * into v_bowl;

    -- The id is taken by a bowl this caller does not own. A client-generated
    -- UUID only collides by replay, so say nothing about whose it is.
    if v_bowl.id is null then
      raise exception 'This bowl could not be created. Please try again.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.bowl_members (bowl_id, user_id, role)
  values (v_bowl.id, v_user_id, 'Owner')
  on conflict (bowl_id, user_id) do nothing;

  return v_bowl;
end;
$$;

revoke all on function public.create_owned_bowl(uuid, text) from public, anon, authenticated;
grant execute on function public.create_owned_bowl(uuid, text) to authenticated;

comment on function public.create_owned_bowl(uuid, text) is
  'Creates a bowl and its Owner membership in one transaction. Repeating the same bowl id returns the existing bowl.';

commit;

begin;

-- The lookup route asks this before it spends anything on a cache miss, TMDB's
-- availability check included. begin_title_departure_fetch repeats the same
-- conditions inside its lock and stays the final word before the vendor call;
-- this only keeps a request that would be refused there from costing a TMDB
-- request on the way.
create function public.can_fetch_title_departure(p_tmdb_id bigint, p_bowl_id uuid, p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(p_tmdb_id > 0, false)
    and exists (
      select 1 from public.profiles where id = p_user_id and cardinality(streaming_services) > 0
    )
    and exists (
      select 1 from public.bowls b
      where b.id = p_bowl_id
        and (b.owner_id = p_user_id or exists (
          select 1 from public.bowl_members m where m.bowl_id = b.id and m.user_id = p_user_id
        ))
        and exists (
          select 1 from public.bowl_active_tmdb_movies a where a.bowl_id = b.id and a.tmdb_id = p_tmdb_id
        )
    );
$$;

revoke all on function public.can_fetch_title_departure(bigint, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_fetch_title_departure(bigint, uuid, uuid) to service_role;

commit;

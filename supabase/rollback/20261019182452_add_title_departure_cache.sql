begin;
drop function if exists public.prune_title_departures();
drop function if exists public.fail_title_departure_fetch(bigint, uuid);
drop function if exists public.complete_title_departure_fetch(bigint, uuid, jsonb);
drop function if exists public.begin_title_departure_fetch(bigint, uuid, uuid, integer);
drop table if exists public.title_departure_usage;
drop table if exists public.title_departures;
commit;

-- Revert the lookup route first: the current route calls this function and
-- treats an error from it as "not allowed", so dropping it under that route
-- silently turns every departure cache miss off.
begin;
drop function if exists public.can_fetch_title_departure(bigint, uuid, uuid);
commit;

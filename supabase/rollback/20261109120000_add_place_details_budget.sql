-- Reverts 20261109120000_add_place_details_budget.sql. Move into migrations/
-- with a fresh timestamp to run it; the drawn restaurant sheet then answers
-- without Google's details, as a deploy without the key does.
begin;

drop function if exists public.begin_place_details_fetch(uuid, uuid, text, text, integer);
drop table if exists public.place_details_usage;

commit;

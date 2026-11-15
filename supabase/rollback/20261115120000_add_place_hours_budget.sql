-- Reverts 20261115120000_add_place_hours_budget.sql. Move into migrations/
-- with a fresh timestamp to run it; the Open filter then leaves nothing out,
-- as a deploy without the key does.
begin;

drop function if exists public.begin_place_hours_fetch(uuid, uuid, text[], integer);
delete from public.place_details_usage where sku = 'hours';
alter table public.place_details_usage
  drop constraint place_details_usage_sku_check;
alter table public.place_details_usage
  add constraint place_details_usage_sku_check check (sku in ('details', 'photo'));

commit;

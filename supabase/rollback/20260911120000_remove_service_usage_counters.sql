-- Reverts 20260911120000_add_service_usage_counters.sql.
-- Move this into supabase/migrations/ with a fresh timestamp to run it.
--
-- Dropping the table discards the recorded history. Export it first if the
-- numbers still matter:
--   copy (select * from public.service_usage_counters order by usage_date)
--   to stdout with csv header;
begin;

drop function if exists public.record_service_usage(text, integer);
drop table if exists public.service_usage_counters;

commit;

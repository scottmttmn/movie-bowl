-- Reverts 20261006120000_add_feedback_reports.sql.
-- Move this into supabase/migrations/ with a fresh timestamp to run it.
--
-- Dropping the table discards every report. Export it first if they still
-- matter:
--   copy (select * from public.feedback_reports order by created_at)
--   to stdout with csv header;
begin;

drop function if exists public.record_feedback_report(uuid, text, text, text, text, text);
drop table if exists public.feedback_reports;

commit;

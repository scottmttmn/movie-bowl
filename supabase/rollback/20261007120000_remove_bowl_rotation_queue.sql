-- Reverts 20261007120000_add_bowl_rotation_queue.sql.
-- Move this into supabase/migrations/ with a fresh timestamp to run it.
--
-- The people sheet treats a failed read as no order and lists people as it
-- always has, so the app keeps working without the function.
begin;

drop function if exists public.get_bowl_rotation_queue(uuid, uuid[]);

commit;

-- Emergency rollback for
-- 20260727150000_save_draw_access_atomically.sql.
-- Move this file into supabase/migrations with a new timestamp before applying.
-- The application must also be rolled back to its prior client-side updates.

begin;

revoke all on function public.save_bowl_draw_access(uuid, text, uuid[])
from public, anon, authenticated;

drop function if exists public.save_bowl_draw_access(uuid, text, uuid[]);

commit;

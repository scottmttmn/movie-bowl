-- Emergency rollback for
-- 20260727140000_delete_bowls_atomically.sql.
-- Move this file into supabase/migrations with a new timestamp before applying.
-- The application must also be rolled back to its prior client-side deletion.

begin;

revoke all on function public.delete_owned_bowl(uuid)
from public, anon, authenticated;

drop function if exists public.delete_owned_bowl(uuid);

commit;

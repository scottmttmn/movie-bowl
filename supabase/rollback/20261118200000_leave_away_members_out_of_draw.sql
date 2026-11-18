-- Reverts 20261118200000_leave_away_members_out_of_draw.sql. Move into
-- migrations/ with a fresh timestamp to run it; every member then gets every
-- draw in their history again. Deploy the client that stops calling it first
-- (a call to a missing function is logged and the draw stands).
begin;

drop function if exists public.leave_away_members_out_of_draw(uuid, uuid[]);

commit;

-- Reverts the atomic invite acceptance RPC. Move this file back into
-- migrations/ with a fresh timestamp to run it.
--
-- Membership rows and finalized invites created by the function are correct
-- acceptances and are left alone; only the entry point is removed. Deploy the
-- client that writes bowl_members and bowl_invites directly before applying
-- this, or invite acceptance has no path at all.

begin;

drop function if exists public.accept_bowl_invite(text);

commit;

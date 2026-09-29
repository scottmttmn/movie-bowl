-- Nothing in the client inserts or updates a bowl_members row. Joining goes
-- through accept_bowl_invite, creating through create_owned_bowl, ownership
-- through transfer_owned_bowl, and account deletion through
-- delete_account_data_for_user, all security definer. The client only reads
-- rows and deletes them: an owner removing a member, a member leaving.
--
-- These four policies predate the migrations and are broader than any of
-- that. Dropping them leaves roster writes keyed on bowls.owner_id or
-- auth.uid(), never on the role column.

begin;

drop policy if exists "Invited user can join bowl via invite" on public.bowl_members;
drop policy if exists "bowl_members_insert_owner_only" on public.bowl_members;
drop policy if exists "bowl_members_update_owner_only" on public.bowl_members;
drop policy if exists "bowl_members_delete_owner_only" on public.bowl_members;

-- Only those policies called it.
drop function if exists public.is_bowl_owner_member(uuid);

commit;

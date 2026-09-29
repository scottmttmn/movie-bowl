-- Reverts 20260929130000_let_add_link_labels_save.sql. Move into migrations/
-- with a fresh timestamp to run it.
--
-- This knowingly returns add-link labels to saving nothing: with no UPDATE
-- policy, every relabel matches zero rows. Deploy the client revert too, or
-- Bowl Settings will report each attempt as a failure, which is at least true.

begin;

drop policy if exists "Bowl owners or creators can relabel add links" on public.bowl_add_links;

revoke update (default_contributor_name) on public.bowl_add_links from authenticated;
grant update on public.bowl_add_links to anon, authenticated;

commit;

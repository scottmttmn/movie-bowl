-- Reverts 20260929140000_create_owned_bowl_atomically.sql. Move into
-- migrations/ with a fresh timestamp to run it.
--
-- Deploy the reverted client first: the current one creates every bowl through
-- this function, so dropping it first leaves no way to create a bowl. Bowls it
-- created are ordinary bowls with an Owner membership and need no repair.

begin;

drop function if exists public.create_owned_bowl(uuid, text);

commit;

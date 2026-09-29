-- Reverts 20260929160000_create_owned_bowl_as_definer.sql. Move into
-- migrations/ with a fresh timestamp to run it.
--
-- This knowingly breaks bowl creation again wherever the bowl_members insert
-- policy refuses the Owner row, as the deployed one does.

alter function public.create_owned_bowl(uuid, text) security invoker;

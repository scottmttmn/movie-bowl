-- create_owned_bowl ran as the caller so the existing table policies would
-- decide both writes. In production the bowl_members insert policy refused the
-- Owner row with 42501, so every bowl creation failed and rolled back.
-- supabase/baseline/ reconstructs that policy more permissively than it is
-- deployed, which is why the suites passed.
--
-- The function now runs as its owner, like accept_bowl_invite, and does its
-- own authorization, which it already did in full: it requires a signed-in
-- caller, only ever reads or writes a bowl whose owner is that caller, and only
-- ever adds that caller's own Owner row. The ten-bowl trigger still runs on
-- the insert, because triggers fire whoever the function runs as.

alter function public.create_owned_bowl(uuid, text) security definer;

revoke all on function public.create_owned_bowl(uuid, text) from public, anon, authenticated;
grant execute on function public.create_owned_bowl(uuid, text) to authenticated;

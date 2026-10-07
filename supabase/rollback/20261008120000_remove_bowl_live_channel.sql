-- Reverts 20261008120000_add_bowl_live_channel.sql.
-- Move this into supabase/migrations/ with a fresh timestamp to run it.
--
-- Without the policies Realtime refuses every join on a private channel, and
-- the app treats a refused join as no television: the draw button loses its
-- mark and draws exactly as it did before.
begin;

drop policy if exists "Bowl members send on their bowl's live channel" on realtime.messages;
drop policy if exists "Bowl members receive their bowl's live channel" on realtime.messages;
drop function if exists public.can_use_bowl_live_channel(text, text, boolean);

commit;

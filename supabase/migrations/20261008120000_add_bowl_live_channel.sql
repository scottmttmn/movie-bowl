-- A bowl's live channel: the private Realtime channel `bowl-live:<bowl id>`
-- that lets a television sitting on a bowl play a draw made on someone's
-- phone, and lets the phone see that a television is listening.
--
-- Realtime decides who may join or send on a private channel by running the
-- caller against these policies on `realtime.messages`. Receiving -- the
-- broadcast and who is present -- is for anyone in the bowl. Saying "I am
-- here" is too. Announcing a draw is only for someone the bowl lets draw, the
-- same rule `draw_bowl_movie` enforces, so a member who cannot draw cannot
-- make the television play one. What is announced is still only a claim:
-- the television reloads the bowl and opens nothing the database does not
-- show was drawn.

create or replace function public.can_use_bowl_live_channel(
  p_topic text,
  p_extension text,
  p_sending boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bowl_id uuid;
begin
  if p_topic is null
    or p_topic !~ '^bowl-live:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_bowl_id := substr(p_topic, length('bowl-live:') + 1)::uuid;

  if p_sending and p_extension = 'broadcast' then
    return public.can_draw_from_bowl(v_bowl_id);
  end if;

  if p_extension not in ('broadcast', 'presence') then
    return false;
  end if;

  return public.is_bowl_owner(v_bowl_id) or public.is_bowl_member(v_bowl_id);
end;
$$;

revoke all on function public.can_use_bowl_live_channel(text, text, boolean) from public, anon;
grant execute on function public.can_use_bowl_live_channel(text, text, boolean) to authenticated;

drop policy if exists "Bowl members receive their bowl's live channel" on realtime.messages;
create policy "Bowl members receive their bowl's live channel"
on realtime.messages
for select
to authenticated
using (public.can_use_bowl_live_channel(realtime.topic(), extension, false));

drop policy if exists "Bowl members send on their bowl's live channel" on realtime.messages;
create policy "Bowl members send on their bowl's live channel"
on realtime.messages
for insert
to authenticated
with check (public.can_use_bowl_live_channel(realtime.topic(), extension, true));

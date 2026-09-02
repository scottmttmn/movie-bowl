-- Roll back only after clients have stopped calling create_bowl_invites and
-- revoke_bowl_invite. Dropping bowl_invite_batches discards request replay
-- history, so a later retry of an old request UUID is no longer idempotent.

begin;

drop function if exists public.revoke_bowl_invite(uuid, uuid);
drop function if exists public.create_bowl_invites(uuid, text[], uuid);
drop table if exists public.bowl_invite_batches;
drop index if exists public.bowl_invites_one_pending_per_email_idx;

grant all on table public.bowl_invites to anon, authenticated, service_role;

create policy "Owners can create bowl invites"
  on public.bowl_invites
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.bowls bowl
      where bowl.id = bowl_invites.bowl_id
        and bowl.owner_id = auth.uid()
    )
    and invited_by = auth.uid()
  );

create policy "Owners can delete bowl invites"
  on public.bowl_invites
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.bowls bowl
      where bowl.id = bowl_invites.bowl_id
        and bowl.owner_id = auth.uid()
    )
  );

create policy "Invited user can update invite"
  on public.bowl_invites
  for update
  to authenticated
  using (lower(invited_email) = lower(auth.email()))
  with check (lower(invited_email) = lower(auth.email()));

commit;

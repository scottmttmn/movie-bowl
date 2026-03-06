-- Ensure invitee policies are authenticated-only and email-matched.
-- This migration intentionally replaces legacy public/profile-based invitee policies.

drop policy if exists "Invited user can view their invite" on public.bowl_invites;
drop policy if exists "Invited user can update invite" on public.bowl_invites;

create policy "Invited user can view their invite"
on public.bowl_invites
for select
to authenticated
using (
  lower(invited_email) = lower(auth.email())
);

create policy "Invited user can update invite"
on public.bowl_invites
for update
to authenticated
using (
  lower(invited_email) = lower(auth.email())
)
with check (
  lower(invited_email) = lower(auth.email())
);

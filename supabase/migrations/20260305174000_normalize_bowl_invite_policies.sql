-- Normalize bowl_invites policies for invite inbox behavior:
-- - Owners manage invites (create/view/delete) as authenticated users.
-- - Invitees can view/update/delete only their own invite rows by email.

alter table public.bowl_invites enable row level security;

-- Drop legacy/redundant policies if they exist.
drop policy if exists "Owner can create invites" on public.bowl_invites;
drop policy if exists "Owner can view invites" on public.bowl_invites;
drop policy if exists "Owners can create bowl invites" on public.bowl_invites;
drop policy if exists "Owners can view bowl invites" on public.bowl_invites;
drop policy if exists "Owners can delete bowl invites" on public.bowl_invites;
drop policy if exists "Invited user can view their invite" on public.bowl_invites;
drop policy if exists "Invited user can update invite" on public.bowl_invites;
drop policy if exists "Invited user can delete invite" on public.bowl_invites;

create policy "Owners can create bowl invites"
on public.bowl_invites
for insert
to authenticated
with check (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_invites.bowl_id
      and b.owner_id = auth.uid()
  )
);

create policy "Owners can view bowl invites"
on public.bowl_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_invites.bowl_id
      and b.owner_id = auth.uid()
  )
);

create policy "Owners can delete bowl invites"
on public.bowl_invites
for delete
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_invites.bowl_id
      and b.owner_id = auth.uid()
  )
);

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

create policy "Invited user can delete invite"
on public.bowl_invites
for delete
to authenticated
using (
  lower(invited_email) = lower(auth.email())
);

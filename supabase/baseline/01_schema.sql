-- The schema as it stood before this repository's first migration.
--
-- Movie Bowl's first tables were made in the Supabase dashboard, so
-- `supabase/migrations/` opens in March 2026 on a database that already had
-- them. That gap is why the pgTAP suites had to be seeded from a dump of the
-- production project, and why they could not run anywhere a production
-- credential could not go. This file closes it: baseline plus migrations is the
-- whole schema, reproducible from the repository alone.
--
-- It is not a record of how those objects were originally made. It is a
-- statement of what they are, written so that applying it and then every
-- migration in order lands on the deployed schema. Anything a later migration
-- replaces outright -- the `profiles` and `bowl_movies` policies, two of the
-- `bowl_invites` ones -- is kept here only in the shape the migration expects
-- to find and drop.
--
-- Do not add new schema here. New work is a migration; this file moves only if
-- the pre-March-2026 schema turns out to have been described wrongly.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Accounts. One row per auth user, created by the client on first sign-in.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  streaming_services text[] not null default '{}',
  default_draw_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- A bowl. `max_contribution_lead` caps how far ahead of the field one person
-- may get; null means no cap.
create table if not exists public.bowls (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  draw_access_mode text not null default 'all_members'
    check (draw_access_mode in ('all_members', 'selected_members')),
  max_contribution_lead integer
);

create table if not exists public.bowl_members (
  id uuid primary key default extensions.gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'Member',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bowl_id, user_id)
);

-- The allow-list behind `bowls.draw_access_mode = 'selected_members'`.
create table if not exists public.bowl_draw_permissions (
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bowl_id, user_id)
);

-- A slip in the bowl. `snapshot_at` records when the TMDB details beside it
-- were taken; a custom slip carries a negative synthetic `tmdb_id` and none of
-- them.
create table if not exists public.bowl_movies (
  id uuid primary key default extensions.gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  tmdb_id bigint not null,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[] not null default '{}',
  overview text,
  snapshot_at timestamptz,
  added_at timestamptz not null default now(),
  drawn_at timestamptz,
  drawn_by uuid references auth.users(id) on delete set null
);

create index if not exists bowl_movies_bowl_id_idx on public.bowl_movies (bowl_id);
create index if not exists bowl_movies_undrawn_idx
  on public.bowl_movies (bowl_id) where drawn_at is null;

create table if not exists public.bowl_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  invited_email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membership predicates
-- ---------------------------------------------------------------------------

-- The two predicates every policy below is written in terms of. They are
-- security definer because asking "is this person in this bowl?" from a policy
-- on `bowls` means reading `bowl_members`, whose own policies ask the same
-- question back; a definer function is what breaks that recursion. They are
-- reachable by `authenticated`, unavoidably: a policy's expression is evaluated
-- as the role doing the query, so revoking execute would lock every member out
-- of their own bowl. Being definer-run is what makes that safe -- each one
-- answers only about `auth.uid()` and returns a boolean, so a caller learns
-- nothing it could not learn by reading the bowl it is asking about.
create or replace function public.is_bowl_owner(p_bowl_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.bowls b
    where b.id = p_bowl_id
      and b.owner_id = auth.uid()
  );
$$;

create or replace function public.is_bowl_member(p_bowl_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.bowl_members bm
    where bm.bowl_id = p_bowl_id
      and bm.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.bowls enable row level security;
alter table public.bowl_members enable row level security;
alter table public.bowl_draw_permissions enable row level security;
alter table public.bowl_movies enable row level security;
alter table public.bowl_invites enable row level security;

-- Replaced wholesale by 20260726153000; here in the shape it drops.
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "bowls_select_accessible"
on public.bowls
for select
to authenticated
using (owner_id = auth.uid() or public.is_bowl_member(id));

create policy "bowls_insert_own"
on public.bowls
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "bowls_update_owner"
on public.bowls
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "bowls_delete_owner"
on public.bowls
for delete
to authenticated
using (owner_id = auth.uid());

create policy "bowl_members_select_accessible"
on public.bowl_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_bowl_owner(bowl_id)
  or public.is_bowl_member(bowl_id)
);

create policy "bowl_members_insert_owner_or_self"
on public.bowl_members
for insert
to authenticated
with check (user_id = auth.uid() or public.is_bowl_owner(bowl_id));

create policy "bowl_members_delete_owner_or_self"
on public.bowl_members
for delete
to authenticated
using (user_id = auth.uid() or public.is_bowl_owner(bowl_id));

create policy "bowl_draw_permissions_select_accessible"
on public.bowl_draw_permissions
for select
to authenticated
using (public.is_bowl_owner(bowl_id) or public.is_bowl_member(bowl_id));

-- Replaced wholesale by 20260726153000 and 20260904120000.
create policy "bowl_movies_select_members"
on public.bowl_movies
for select
to authenticated
using (true);

create policy "bowl_movies_insert_members"
on public.bowl_movies
for insert
to authenticated
with check (added_by = auth.uid());

create policy "bowl_movies_update_with_draw_access"
on public.bowl_movies
for update
to authenticated
using (true)
with check (true);

create policy "bowl_movies_delete_members"
on public.bowl_movies
for delete
to authenticated
using (true);

-- Replaced by 20260305174000 and hardened again by 20260902120000.
create policy "Owner can view invites"
on public.bowl_invites
for select
to authenticated
using (public.is_bowl_owner(bowl_id));

create policy "Owner can create invites"
on public.bowl_invites
for insert
to authenticated
with check (public.is_bowl_owner(bowl_id));

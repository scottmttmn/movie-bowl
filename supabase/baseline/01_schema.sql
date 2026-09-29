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

-- Checked column by column against a schema dump of the linked project on
-- September 29, 2026. Some of this reads as an oversight -- nullable columns,
-- `bowl_invites` timestamps without a time zone, a lower-case `'member'`
-- default nothing relies on because every writer names the role -- but it is
-- what production has, and a baseline that tidies it tests a database nobody
-- runs.

-- Accounts. One row per auth user. The other tables reference profiles rather
-- than auth.users, as production does.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  streaming_services text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  default_draw_settings jsonb not null default '{}'::jsonb
);

-- A bowl. `max_contribution_lead` caps how far ahead of the field one person
-- may get; null means no cap. `visibility` is unused.
create table if not exists public.bowls (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references public.profiles(id) on delete cascade,
  visibility text default 'private',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  max_contribution_lead integer
    constraint bowls_max_contribution_lead_check
    check (max_contribution_lead is null or max_contribution_lead >= 1),
  draw_access_mode text not null default 'all_members'
    check (draw_access_mode in ('all_members', 'selected_members'))
);

create table if not exists public.bowl_members (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid references public.bowls(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bowl_id, user_id)
);

-- Redundant with the unique constraint above, and production's.
create unique index if not exists bowl_members_bowl_user_uidx
  on public.bowl_members (bowl_id, user_id);

-- The allow-list behind `bowls.draw_access_mode = 'selected_members'`. Keyed
-- to the membership row, so leaving a bowl takes the permission with it.
create table if not exists public.bowl_draw_permissions (
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (bowl_id, user_id),
  constraint bowl_draw_permissions_bowl_member_fkey
    foreign key (bowl_id, user_id)
    references public.bowl_members (bowl_id, user_id)
    on delete cascade
);

-- A slip in the bowl. `snapshot_at` records when the TMDB details beside it
-- were taken; a custom slip carries a negative synthetic `tmdb_id`.
create table if not exists public.bowl_movies (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  added_by uuid not null references public.profiles(id) on delete restrict,
  tmdb_id bigint not null,
  title text not null,
  poster_path text,
  release_date date,
  runtime integer,
  genres text[],
  overview text,
  snapshot_at timestamptz not null default now(),
  added_at timestamptz not null default now(),
  drawn_at timestamptz,
  drawn_by uuid references public.profiles(id)
);

create index if not exists bowl_movies_bowl_drawn_idx
  on public.bowl_movies (bowl_id, drawn_at);
create index if not exists bowl_movies_bowl_remaining_idx
  on public.bowl_movies (bowl_id) where drawn_at is null;

create table if not exists public.bowl_invites (
  id uuid primary key default gen_random_uuid(),
  bowl_id uuid not null references public.bowls(id) on delete cascade,
  invited_email text not null,
  invited_by uuid not null references public.profiles(id),
  token text not null unique,
  accepted_at timestamp,
  created_at timestamp default now()
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
create or replace function public.is_bowl_owner(bid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bowls
    where id = bid and owner_id = auth.uid()
  );
$$;

create or replace function public.is_bowl_member(bid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bowl_members
    where bowl_id = bid
      and user_id = auth.uid()
  );
$$;

-- Dropped by 20260929230000; here in the shape it drops.
create or replace function public.is_bowl_owner_member(bid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bowl_members
    where bowl_id = bid
      and user_id = auth.uid()
      and role = 'Owner'
  );
$$;

-- Production also has `handle_new_user`, which upserts a profile from an
-- auth.users row. The dump that checked this file covers `public` only, so
-- whether a trigger on auth.users still calls it is unconfirmed. It is left
-- out rather than guessed at.

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

-- Production's policies on these three tables, by production's names and to
-- the roles production grants them (`public` unless stated).
create policy "Users can view their bowls"
on public.bowls
for select
using (owner_id = auth.uid() or public.is_bowl_member(id));

create policy "Users can create bowls"
on public.bowls
for insert
with check (owner_id = auth.uid());

create policy "Owner can update bowl"
on public.bowls
for update
using (owner_id = auth.uid());

create policy "Owner can delete bowl"
on public.bowls
for delete
using (owner_id = auth.uid());

create policy "bowl_members_select_if_member"
on public.bowl_members
for select
using (public.is_bowl_member(bowl_id));

create policy "bowl_members_bootstrap_owner_row"
on public.bowl_members
for insert
with check (
  role = 'Owner'
  and user_id = auth.uid()
  and exists (
    select 1
    from public.bowls b
    where b.id = bowl_members.bowl_id
      and b.owner_id = auth.uid()
  )
);

create policy "Members can leave bowl"
on public.bowl_members
for delete
to authenticated
using (user_id = auth.uid() and role <> 'Owner');

create policy "Owners can remove members"
on public.bowl_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_members.bowl_id
      and b.owner_id = auth.uid()
  )
  and role <> 'Owner'
);

-- Dropped by 20260929230000; here in the shape it drops.
create policy "Invited user can join bowl via invite"
on public.bowl_members
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.bowl_invites bi
    join public.profiles p on p.id = auth.uid()
    where bi.bowl_id = bowl_members.bowl_id
      and lower(bi.invited_email) = lower(p.email)
      and bi.accepted_at is null
  )
);

create policy "bowl_members_insert_owner_only"
on public.bowl_members
for insert
with check (public.is_bowl_owner_member(bowl_id));

create policy "bowl_members_update_owner_only"
on public.bowl_members
for update
using (public.is_bowl_owner_member(bowl_id))
with check (public.is_bowl_owner_member(bowl_id));

create policy "bowl_members_delete_owner_only"
on public.bowl_members
for delete
using (public.is_bowl_owner_member(bowl_id));

create policy "members_can_read_draw_permissions"
on public.bowl_draw_permissions
for select
using (
  exists (
    select 1
    from public.bowl_members bm
    where bm.bowl_id = bowl_draw_permissions.bowl_id
      and bm.user_id = auth.uid()
  )
);

create policy "owner_can_insert_draw_permissions"
on public.bowl_draw_permissions
for insert
with check (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_draw_permissions.bowl_id
      and b.owner_id = auth.uid()
  )
);

create policy "owner_can_delete_draw_permissions"
on public.bowl_draw_permissions
for delete
using (
  exists (
    select 1
    from public.bowls b
    where b.id = bowl_draw_permissions.bowl_id
      and b.owner_id = auth.uid()
  )
);

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

-- Limit direct profile access to the authenticated user's own row and reduce
-- bowl_movies privileges to the operations used by the application.
-- Cross-user display emails are available only through the scoped directory
-- functions added in 20260726140000_add_scoped_profile_directories.sql.

begin;

alter table public.profiles enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

alter table public.bowl_movies enable row level security;

drop policy if exists "bowl_movies_select_members" on public.bowl_movies;
drop policy if exists "bowl_movies_insert_members" on public.bowl_movies;
drop policy if exists "bowl_movies_delete_members" on public.bowl_movies;
drop policy if exists "bowl_movies_update_with_draw_access" on public.bowl_movies;

create policy bowl_movies_select_members
on public.bowl_movies
for select
to authenticated
using (
  public.is_bowl_owner(bowl_id)
  or public.is_bowl_member(bowl_id)
);

create policy bowl_movies_insert_own_undrawn
on public.bowl_movies
for insert
to authenticated
with check (
  (
    public.is_bowl_owner(bowl_id)
    or public.is_bowl_member(bowl_id)
  )
  and added_by = auth.uid()
  and drawn_at is null
  and drawn_by is null
  and added_by_name is null
  and added_via_link_id is null
);

create policy bowl_movies_delete_owner_or_own_undrawn
on public.bowl_movies
for delete
to authenticated
using (
  public.is_bowl_owner(bowl_id)
  or (
    public.is_bowl_member(bowl_id)
    and added_by = auth.uid()
    and drawn_at is null
  )
);

revoke all on table public.bowl_movies from public, anon, authenticated;
grant select, insert, delete on table public.bowl_movies to authenticated;

commit;

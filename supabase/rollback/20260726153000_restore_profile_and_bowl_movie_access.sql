-- Emergency rollback for
-- 20260726153000_tighten_profile_and_bowl_movie_access.sql.
-- Move this file into supabase/migrations with a new timestamp before applying.

begin;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy "Authenticated users can read profiles"
on public.profiles
for select
using (auth.uid() is not null);

create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

revoke all on table public.profiles from public, anon, authenticated;
grant all on table public.profiles to anon, authenticated;

drop policy if exists bowl_movies_select_members on public.bowl_movies;
drop policy if exists bowl_movies_insert_own_undrawn on public.bowl_movies;
drop policy if exists bowl_movies_delete_owner_or_own_undrawn on public.bowl_movies;

create policy bowl_movies_select_members
on public.bowl_movies
for select
using (public.is_bowl_member(bowl_id));

create policy bowl_movies_insert_members
on public.bowl_movies
for insert
with check (
  public.is_bowl_member(bowl_id)
  and added_by = auth.uid()
);

create policy bowl_movies_delete_members
on public.bowl_movies
for delete
using (public.is_bowl_member(bowl_id));

create policy bowl_movies_update_with_draw_access
on public.bowl_movies
for update
using (
  public.is_bowl_owner(bowl_id)
  or (
    public.is_bowl_member(bowl_id)
    and exists (
      select 1
      from public.bowls bowl
      where bowl.id = bowl_movies.bowl_id
        and (
          bowl.draw_access_mode = 'all_members'
          or (
            bowl.draw_access_mode = 'selected_members'
            and exists (
              select 1
              from public.bowl_draw_permissions permission
              where permission.bowl_id = bowl_movies.bowl_id
                and permission.user_id = auth.uid()
            )
          )
        )
    )
  )
)
with check (
  public.is_bowl_owner(bowl_id)
  or (
    public.is_bowl_member(bowl_id)
    and exists (
      select 1
      from public.bowls bowl
      where bowl.id = bowl_movies.bowl_id
        and (
          bowl.draw_access_mode = 'all_members'
          or (
            bowl.draw_access_mode = 'selected_members'
            and exists (
              select 1
              from public.bowl_draw_permissions permission
              where permission.bowl_id = bowl_movies.bowl_id
                and permission.user_id = auth.uid()
            )
          )
        )
    )
  )
);

revoke all on table public.bowl_movies from public, anon, authenticated;
grant all on table public.bowl_movies to anon, authenticated;

commit;

-- Bowl draw access controls
-- Run in Supabase SQL editor.

alter table public.bowls
  add column if not exists draw_access_mode text not null default 'all_members';

alter table public.bowls
  drop constraint if exists bowls_draw_access_mode_check;

alter table public.bowls
  add constraint bowls_draw_access_mode_check
  check (draw_access_mode in ('all_members', 'selected_members'));

create unique index if not exists bowl_members_bowl_user_uidx
  on public.bowl_members (bowl_id, user_id);

create table if not exists public.bowl_draw_permissions (
  bowl_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (bowl_id, user_id)
);

alter table public.bowl_draw_permissions
  drop constraint if exists bowl_draw_permissions_bowl_id_fkey;

alter table public.bowl_draw_permissions
  add constraint bowl_draw_permissions_bowl_id_fkey
  foreign key (bowl_id) references public.bowls(id) on delete cascade;

alter table public.bowl_draw_permissions
  drop constraint if exists bowl_draw_permissions_bowl_member_fkey;

alter table public.bowl_draw_permissions
  add constraint bowl_draw_permissions_bowl_member_fkey
  foreign key (bowl_id, user_id) references public.bowl_members(bowl_id, user_id) on delete cascade;

alter table public.bowl_draw_permissions enable row level security;

-- Members can read draw permissions for bowls they belong to.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bowl_draw_permissions'
      and policyname = 'members_can_read_draw_permissions'
  ) then
    create policy members_can_read_draw_permissions
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
  end if;
end $$;

-- Only bowl owner can modify draw permissions rows.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bowl_draw_permissions'
      and policyname = 'owner_can_insert_draw_permissions'
  ) then
    create policy owner_can_insert_draw_permissions
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
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bowl_draw_permissions'
      and policyname = 'owner_can_delete_draw_permissions'
  ) then
    create policy owner_can_delete_draw_permissions
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
  end if;
end $$;

-- IMPORTANT: Existing bowl_movies UPDATE policy for draw operations must be updated
-- to enforce draw access by mode + selected members. Use this condition in that policy:
--
--   exists (select 1 from public.bowls b where b.id = bowl_movies.bowl_id and b.owner_id = auth.uid())
--   OR (
--     exists (select 1 from public.bowl_members bm where bm.bowl_id = bowl_movies.bowl_id and bm.user_id = auth.uid())
--     AND exists (
--       select 1
--       from public.bowls b
--       where b.id = bowl_movies.bowl_id
--         and (
--           b.draw_access_mode = 'all_members'
--           OR (
--             b.draw_access_mode = 'selected_members'
--             AND exists (
--               select 1
--               from public.bowl_draw_permissions bdp
--               where bdp.bowl_id = bowl_movies.bowl_id
--                 and bdp.user_id = auth.uid()
--             )
--           )
--         )
--     )
--   )
--
-- If your current policy already allows all members to update bowl_movies, replace that
-- draw-specific update policy rather than adding another permissive one.

-- Sanity checks
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bowls'
  and column_name = 'draw_access_mode';

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'bowl_draw_permissions';

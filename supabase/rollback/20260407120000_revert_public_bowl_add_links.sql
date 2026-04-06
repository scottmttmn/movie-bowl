drop policy if exists "Bowl members can revoke add links" on public.bowl_add_links;
drop policy if exists "Bowl members can create add links" on public.bowl_add_links;
drop policy if exists "Bowl members can view add links" on public.bowl_add_links;

drop function if exists public.consume_bowl_add_link(text, jsonb);

drop table if exists public.bowl_add_links;

drop index if exists public.bowl_movies_added_via_link_id_idx;
alter table public.bowl_movies
  drop column if exists added_via_link_id;

-- IMPORTANT:
-- This only succeeds if there are no bowl_movies rows with added_by IS NULL.
-- If public add-link movies have already been inserted, either delete them or
-- backfill added_by before running this migration.
alter table public.bowl_movies
  alter column added_by set not null;

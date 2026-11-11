-- Reverts 20261110120000_add_watch_history_share_links.sql. Move into
-- migrations/ with a fresh timestamp to run it; every shared link stops
-- working at once and the Watch History share button errors until the app
-- that offers it is rolled back too.
begin;

drop function if exists public.get_shared_watch_history(text);
drop function if exists public.delete_my_watch_history_share_link();
drop function if exists public.save_my_watch_history_share_link(boolean);
drop function if exists public.get_my_watch_history_share_link();
drop table if exists public.watch_history_share_links;

commit;

-- Removes solo draws: drops record_solo_draw and the watch-event columns that
-- identify a solo entry and tie it to the slip it drew.
--
-- This deletes every recorded solo draw. Those rows are personal history, and
-- nothing else holds a copy of them -- a solo draw writes no bowl_draw_events
-- row by design -- so the deletion is permanent. Roll back only alongside a
-- client that no longer offers solo draws, and only if losing that history is
-- acceptable. The bowls themselves are unaffected, because a solo draw never
-- changed one.

begin;

drop function if exists public.record_solo_draw(uuid, text, uuid);

delete from public.user_watch_events
where source_kind = 'solo_draw';

drop index if exists public.user_watch_events_user_request_idx;
drop index if exists public.user_watch_events_source_bowl_movie_idx;

alter table public.user_watch_events
  drop constraint if exists user_watch_events_solo_draw_shape_check;

alter table public.user_watch_events
  drop constraint if exists user_watch_events_source_kind_check;

alter table public.user_watch_events
  add constraint user_watch_events_source_kind_check
  check (source_kind in ('bowl_draw', 'manual'));

alter table public.user_watch_events
  drop column if exists source_bowl_movie_id,
  drop column if exists source_bowl_id,
  drop column if exists request_id;

commit;

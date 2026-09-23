-- Withdraws the TMDB snapshot refresh: both functions go, so the cron's
-- snapshot pass fails and is skipped while the filter refresh carries on.
--
-- The snapshot_at column on user_watch_events stays. It is nullable, so every
-- insert path keeps working without the trigger, and dropping it would lose the
-- freshness stamps a re-applied migration would otherwise start from. The
-- tmdb_id indexes stay for the same reason. Nothing cleared by the expiry step
-- comes back: those details were past TMDB's six-month limit.

begin;

drop function if exists public.apply_tmdb_title_snapshot(
  bigint, boolean, text, text, date, integer, text[], text
);
drop function if exists public.select_tmdb_title_snapshot_refreshes(integer, timestamptz);

-- New history rows stop being stamped; the column keeps what it has.
drop trigger if exists stamp_user_watch_event_snapshot on public.user_watch_events;
drop function if exists public.stamp_user_watch_event_snapshot();
drop function if exists public.derive_user_watch_event_snapshot_at(uuid, text, uuid, uuid, timestamptz);

commit;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000301', 'snapshot-owner@example.com');

insert into public.profiles (id, email)
values ('00000000-0000-0000-0000-000000000301', 'snapshot-owner@example.com');

insert into public.bowls (id, name, owner_id)
values ('10000000-0000-0000-0000-000000000301', 'Snapshot Bowl', '00000000-0000-0000-0000-000000000301');

-- 30301: a slip in the bowl, freshly snapshotted.
-- 30302: drawn 160 days ago, so past the 150-day refresh age but inside six months.
-- 30303: drawn seven months ago, past the limit.
-- -30304: a custom title, which is never touched.
insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title, poster_path, runtime, genres, overview, snapshot_at)
values
  ('20000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000301', 30301, 'Fresh Slip', '/fresh.jpg', 100, '{Drama}', 'Fresh.', now()),
  ('20000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000301', -30304, 'Something with Adam Sandler', '/custom.jpg', 90, '{Comedy}', 'Custom.', now() - interval '1 year');

insert into public.bowl_draw_events (id, bowl_id, bowl_name, added_by, tmdb_id, title, poster_path, release_date, runtime, genres, overview, snapshot_at, drawn_at)
values
  ('30000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000301', 'Snapshot Bowl',
   '00000000-0000-0000-0000-000000000301', 30302, 'Stale Draw', '/stale.jpg', '1990-01-01', 110, '{Action}', 'Stale.',
   now() - interval '160 days', now() - interval '160 days'),
  ('30000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000301', 'Snapshot Bowl',
   '00000000-0000-0000-0000-000000000301', 30303, 'Expired Draw', '/expired.jpg', '1980-01-01', 120, '{Horror}', 'Expired.',
   now() - interval '7 months', now() - interval '7 months');

-- The personal copy of the stale draw, whose title the person edited.
insert into public.user_watch_events (id, user_id, source_draw_event_id, source_kind, bowl_name, tmdb_id, title, poster_path, release_date, runtime, genres, overview, watched_on, created_at, snapshot_at)
values
  ('40000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000301',
   '30000000-0000-0000-0000-000000000302', 'bowl_draw', 'Snapshot Bowl', 30302, 'My Name For It', '/stale.jpg',
   '1991-06-01', 110, '{Action}', 'Stale.', current_date - 160, now() - interval '160 days', now() - interval '160 days'),
  ('40000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000301',
   '30000000-0000-0000-0000-000000000303', 'bowl_draw', 'Snapshot Bowl', 30303, 'Expired Draw', '/expired.jpg',
   '1980-01-01', 120, '{Horror}', 'Expired.', current_date - 210, now() - interval '7 months', now() - interval '7 months');

-- A history row inserted without a stamp gets one, as every insert path does.
insert into public.user_watch_events (id, user_id, source_kind, tmdb_id, title, watched_on)
values ('40000000-0000-0000-0000-000000000399', '00000000-0000-0000-0000-000000000301', 'manual', -30399, 'Unstamped', current_date);

select ok(
  (select snapshot_at > now() - interval '1 minute' from public.user_watch_events where id = '40000000-0000-0000-0000-000000000399'),
  'a history row inserted without a stamp is stamped now'
);

select is(
  (select column_default is not null from information_schema.columns
   where table_schema = 'public' and table_name = 'user_watch_events' and column_name = 'snapshot_at'),
  true,
  'new history rows are stamped by default, so every insert path is covered'
);

-- Only the service role may run either function.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.select_tmdb_title_snapshot_refreshes(10, now()) $$,
  '42501', null, 'a signed-in user cannot select titles for refresh'
);
select throws_ok(
  $$ select public.apply_tmdb_title_snapshot(30302, true, 'X') $$,
  '42501', null, 'a signed-in user cannot write a snapshot'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.apply_tmdb_title_snapshot(30302, true, 'X') $$,
  '42501', null, 'an anonymous caller cannot write a snapshot'
);
reset role;

-- Selection clears what is past six months and orders the rest oldest first.
create temporary table selected on commit drop as
select tmdb_id from public.select_tmdb_title_snapshot_refreshes(10, now() - interval '150 days');

select results_eq(
  $$ select tmdb_id from selected $$,
  $$ values (30303::bigint), (30302::bigint) $$,
  'stale titles are selected oldest first; fresh and custom titles are not'
);

select ok(
  (select poster_path is null and overview is null and runtime is null and genres = '{}'
     and title = 'Expired Draw' and release_date = '1980-01-01'
   from public.bowl_draw_events where id = '30000000-0000-0000-0000-000000000303'),
  'an expired draw loses its descriptive fields and keeps its title and year'
);

select ok(
  (select poster_path is null and overview is null and title = 'Expired Draw'
   from public.user_watch_events where id = '40000000-0000-0000-0000-000000000303'),
  'an expired history entry is cleared the same way'
);

select ok(
  (select poster_path = '/stale.jpg' from public.bowl_draw_events where id = '30000000-0000-0000-0000-000000000302'),
  'a stale title inside six months is refreshed, not cleared'
);

select ok(
  (select poster_path = '/custom.jpg' and overview = 'Custom.'
   from public.bowl_movies where id = '20000000-0000-0000-0000-000000000304'),
  'a custom title is never cleared, however old'
);

select throws_ok(
  $$ select public.apply_tmdb_title_snapshot(-30304, true, 'X') $$,
  '22023', 'Only TMDB titles can be refreshed.',
  'a custom title cannot be refreshed from TMDB'
);

-- A fresh fetch lands on every row holding the title.
select is(
  public.apply_tmdb_title_snapshot(30302, true, 'Stale Draw (Restored)', '/new.jpg', '1990-02-02', 111, '{Action,Thriller}', 'New overview.'),
  2,
  'one fetch updates the draw event and the history entry'
);

select ok(
  (select title = 'Stale Draw (Restored)' and release_date = '1990-02-02' and poster_path = '/new.jpg'
     and runtime = 111 and genres = '{Action,Thriller}' and overview = 'New overview.'
     and snapshot_at > now() - interval '1 minute'
   from public.bowl_draw_events where id = '30000000-0000-0000-0000-000000000302'),
  'a draw event takes all six fields and a fresh stamp'
);

select ok(
  (select title = 'My Name For It' and release_date = '1991-06-01'
     and poster_path = '/new.jpg' and runtime = 111 and overview = 'New overview.'
     and snapshot_at > now() - interval '1 minute'
   from public.user_watch_events where id = '40000000-0000-0000-0000-000000000302'),
  'a history entry keeps the person''s title and date and takes the rest'
);

select is(
  (select count(*)::integer from public.select_tmdb_title_snapshot_refreshes(10, now() - interval '150 days') where tmdb_id = 30302),
  0,
  'a refreshed title is no longer selected'
);

-- A title TMDB no longer has is cleared and stamped, so it is not fetched daily.
select is(
  public.apply_tmdb_title_snapshot(30303, false),
  2,
  'a missing title is recorded on every row holding it'
);

select ok(
  (select poster_path is null and overview is null and title = 'Expired Draw'
     and snapshot_at > now() - interval '1 minute'
   from public.bowl_draw_events where id = '30000000-0000-0000-0000-000000000303'),
  'a missing title keeps its name, loses its details, and is stamped'
);

select is(
  (select count(*)::integer from public.select_tmdb_title_snapshot_refreshes(10, now() - interval '150 days')),
  0,
  'nothing is left to refresh'
);

-- A slip in the bowl refreshes like any other row.
select is(
  public.apply_tmdb_title_snapshot(30301, true, 'Fresh Slip', '/fresher.jpg', null, 101, '{Drama}', 'Fresher.'),
  1,
  'a slip in the bowl is refreshed'
);

select ok(
  (select poster_path = '/fresher.jpg' and runtime = 101 and drawn_at is null
   from public.bowl_movies where id = '20000000-0000-0000-0000-000000000301'),
  'a refreshed slip stays undrawn and in the bowl'
);

select * from finish();
rollback;

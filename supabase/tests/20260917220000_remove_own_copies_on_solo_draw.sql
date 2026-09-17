begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'auto-owner@example.com'),
  ('00000000-0000-0000-0000-000000000302', 'auto-friend@example.com'),
  ('00000000-0000-0000-0000-000000000303', 'auto-stranger@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303'
);

insert into public.bowls (id, name, owner_id)
values
  ('10000000-0000-0000-0000-000000000301', 'Auto Own Bowl', '00000000-0000-0000-0000-000000000301'),
  ('10000000-0000-0000-0000-000000000302', 'Auto Shared Bowl', '00000000-0000-0000-0000-000000000302'),
  ('10000000-0000-0000-0000-000000000303', 'Auto Stranger Bowl', '00000000-0000-0000-0000-000000000303'),
  ('10000000-0000-0000-0000-000000000304', 'Auto Doomed Bowl', '00000000-0000-0000-0000-000000000301'),
  ('10000000-0000-0000-0000-000000000305', 'Auto Leaving Bowl', '00000000-0000-0000-0000-000000000303'),
  ('10000000-0000-0000-0000-000000000306', 'Auto Pin Bowl', '00000000-0000-0000-0000-000000000301');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000301', 'Member'),
  ('10000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000301', 'Member'),
  ('10000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000302', 'Member');

insert into public.bowl_movies (
  id, bowl_id, added_by, tmdb_id, title, note, is_pinned, added_at
)
values
  -- The drawn title, in four bowls the caller can reach and one they cannot.
  ('20000000-0000-0000-0000-000000000301', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick', 'Bowl one note', true,
   timestamptz '2026-09-01 12:00:00+00'),
  ('20000000-0000-0000-0000-000000000302', '10000000-0000-0000-0000-000000000302',
   '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick', null, false, now()),
  ('20000000-0000-0000-0000-000000000303', '10000000-0000-0000-0000-000000000303',
   '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick', null, false, now()),
  ('20000000-0000-0000-0000-000000000307', '10000000-0000-0000-0000-000000000304',
   '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick', null, false, now()),
  ('20000000-0000-0000-0000-000000000308', '10000000-0000-0000-0000-000000000305',
   '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick', null, false, now()),
  -- A custom title: its negative synthetic id belongs to this row alone.
  ('20000000-0000-0000-0000-000000000304', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000301', -40304, 'Auto Custom', null, false, now()),
  -- Neither of these is the drawn title, and one is not even the caller's.
  ('20000000-0000-0000-0000-000000000305', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000301', 40305, 'Auto Other', null, false, now()),
  ('20000000-0000-0000-0000-000000000306', '10000000-0000-0000-0000-000000000301',
   '00000000-0000-0000-0000-000000000302', 40306, 'Auto Friend Pick', null, false, now()),
  -- The pin-conflict scenario's own bowl.
  ('20000000-0000-0000-0000-000000000309', '10000000-0000-0000-0000-000000000306',
   '00000000-0000-0000-0000-000000000301', 40309, 'Auto Pinned Pick', 'Pinned note', true, now()),
  ('20000000-0000-0000-0000-000000000310', '10000000-0000-0000-0000-000000000306',
   '00000000-0000-0000-0000-000000000301', 40310, 'Auto Replacement Pin', null, false, now());

select ok(
  has_function_privilege('authenticated', 'public.undo_solo_draw(uuid)', 'execute'),
  'signed-in callers can undo a solo draw'
);

select ok(
  not has_function_privilege('anon', 'public.undo_solo_draw(uuid)', 'execute'),
  'anonymous callers cannot undo a solo draw'
);

select ok(
  not has_table_privilege('authenticated', 'public.solo_draw_removed_copies', 'insert'),
  'clients cannot write removed-copy snapshots themselves'
);

select is(
  (select remove_from_bowls_on_solo_draw from public.profiles
    where id = '00000000-0000-0000-0000-000000000301'),
  false,
  'automatic removal is off until the account asks for it'
);

-- Off: the draw still changes no bowl.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000305',
      'UTC',
      '30000000-0000-0000-0000-000000000301'
    )
  $$,
  'a solo draw is recorded with the setting off'
);

reset role;

select is(
  (select count(*)::integer from public.solo_draw_removed_copies),
  0,
  'the setting off removes nothing'
);

select is(
  (select count(*)::integer from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000305'),
  1,
  'the drawn slip stays in its bowl with the setting off'
);

update public.profiles
set remove_from_bowls_on_solo_draw = true
where id = '00000000-0000-0000-0000-000000000301';

-- On: the draw takes every copy the caller can still reach.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000301',
      'UTC',
      '30000000-0000-0000-0000-000000000302'
    )
  $$,
  'a solo draw is recorded with the setting on'
);

reset role;

select set_config(
  'test.auto_entry_id',
  (select id::text from public.user_watch_events
    where request_id = '30000000-0000-0000-0000-000000000302'),
  true
);

select is(
  (select count(*)::integer from public.bowl_movies
    where id in (
      '20000000-0000-0000-0000-000000000301',
      '20000000-0000-0000-0000-000000000302',
      '20000000-0000-0000-0000-000000000307',
      '20000000-0000-0000-0000-000000000308'
    )),
  0,
  'every accessible own copy of the drawn title is removed'
);

select is(
  (select count(*)::integer from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000303'),
  1,
  'a copy in a bowl the caller has no access to is left alone'
);

select is(
  (select count(*)::integer from public.bowl_movies
    where id in (
      '20000000-0000-0000-0000-000000000305',
      '20000000-0000-0000-0000-000000000306'
    )),
  2,
  'other titles and other people copies are untouched'
);

select is(
  (select count(*)::integer from public.solo_draw_removed_copies
    where watch_event_id = current_setting('test.auto_entry_id')::uuid),
  4,
  'each removed copy is retained for undo'
);

select is(
  (select note from public.solo_draw_removed_copies
    where bowl_movie_id = '20000000-0000-0000-0000-000000000301'),
  'Bowl one note',
  'the snapshot keeps the copy note'
);

select ok(
  (select is_pinned from public.solo_draw_removed_copies
    where bowl_movie_id = '20000000-0000-0000-0000-000000000301'),
  'the snapshot keeps the copy pin'
);

select is(
  (select bowl_name from public.solo_draw_removed_copies
    where bowl_movie_id = '20000000-0000-0000-0000-000000000307'),
  'Auto Doomed Bowl',
  'the snapshot names the bowl, so undo can report a copy it cannot return'
);

-- Three ways a copy stops being able to go back, set up between the draw and
-- the undo: its bowl is deleted, its access is lost, and its place is taken.
delete from public.bowls where id = '10000000-0000-0000-0000-000000000304';

delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000305'
  and user_id = '00000000-0000-0000-0000-000000000301';

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values ('20000000-0000-0000-0000-000000000311', '10000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000302', 40301, 'Auto Pick');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000302","email":"auto-friend@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);

select throws_ok(
  format($$select public.undo_solo_draw(%L)$$, current_setting('test.auto_entry_id')),
  'P0001',
  'This solo draw is no longer available to undo.',
  'somebody else cannot undo your solo draw'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  format($$select public.delete_user_watch_event(%L)$$, current_setting('test.auto_entry_id')),
  'P0001',
  'Undo this draw instead, so the copies it removed go back to your bowls.',
  'an older client cannot delete away the copies undo would restore'
);

select set_config(
  'test.auto_undo_result',
  (select public.undo_solo_draw(current_setting('test.auto_entry_id')::uuid)::text),
  true
);

reset role;

select is(
  (current_setting('test.auto_undo_result')::jsonb ->> 'restored')::integer,
  1,
  'undo restores the copy that can still go back'
);

select is(
  jsonb_array_length(current_setting('test.auto_undo_result')::jsonb -> 'skipped'),
  3,
  'undo reports each copy it had to skip'
);

select is(
  (select jsonb_agg(entry ->> 'reason' order by entry ->> 'reason')
    from jsonb_array_elements(current_setting('test.auto_undo_result')::jsonb -> 'skipped') as entry),
  '["already_added", "bowl_gone", "no_access"]'::jsonb,
  'undo says why each skipped copy could not go back'
);

select is(
  (select bowl_id from public.bowl_movies where id = '20000000-0000-0000-0000-000000000301'),
  '10000000-0000-0000-0000-000000000301'::uuid,
  'the restored copy is back in the bowl it was taken from'
);

select is(
  (select note from public.bowl_movies where id = '20000000-0000-0000-0000-000000000301'),
  'Bowl one note',
  'the restored copy keeps its note'
);

select ok(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000301'),
  'the restored copy keeps its pin'
);

select is(
  (select added_at from public.bowl_movies where id = '20000000-0000-0000-0000-000000000301'),
  timestamptz '2026-09-01 12:00:00+00',
  'the restored copy keeps its place in the bowl'
);

select is(
  (select count(*)::integer from public.user_watch_events
    where id = current_setting('test.auto_entry_id')::uuid),
  0,
  'undo still deletes the history entry'
);

select is(
  (select count(*)::integer from public.solo_draw_removed_copies
    where watch_event_id = current_setting('test.auto_entry_id')::uuid),
  0,
  'the snapshots go with the entry they belonged to'
);

select throws_ok(
  $$
    insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title)
    values ('10000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000301', 40301, 'Auto Pick')
  $$,
  '23505',
  null,
  'a restored copy is active again for the duplicate registry'
);

-- A custom title has no shared id, so only its own row moves.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000304',
      'UTC',
      '30000000-0000-0000-0000-000000000303'
    )
  $$,
  'a custom title can be drawn solo with the setting on'
);

reset role;

select set_config(
  'test.auto_custom_entry_id',
  (select id::text from public.user_watch_events
    where request_id = '30000000-0000-0000-0000-000000000303'),
  true
);

select is(
  (select jsonb_agg(bowl_movie_id order by bowl_movie_id)
    from public.solo_draw_removed_copies
    where watch_event_id = current_setting('test.auto_custom_entry_id')::uuid),
  '["20000000-0000-0000-0000-000000000304"]'::jsonb,
  'a custom title removes its own row and nothing else'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  format($$select public.undo_solo_draw(%L)$$, current_setting('test.auto_custom_entry_id')),
  'a custom title can be undone'
);

reset role;

select is(
  (select title from public.bowl_movies where id = '20000000-0000-0000-0000-000000000304'),
  'Auto Custom',
  'the custom copy is restored by its own row id'
);

-- A pin that moved while the copy was gone: the copy still goes back.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000309',
      'UTC',
      '30000000-0000-0000-0000-000000000304'
    )
  $$,
  'a pinned title can be drawn solo with the setting on'
);

reset role;

update public.bowl_movies
set is_pinned = true
where id = '20000000-0000-0000-0000-000000000310';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select set_config(
  'test.auto_pin_undo_result',
  (
    select public.undo_solo_draw(
      (select id from public.user_watch_events
        where request_id = '30000000-0000-0000-0000-000000000304')
    )::text
  ),
  true
);

reset role;

select is(
  (current_setting('test.auto_pin_undo_result')::jsonb ->> 'restored')::integer,
  1,
  'a copy whose pin has been taken is still restored'
);

select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000309'),
  false,
  'the restored copy gives up only its pin, which now belongs to another title'
);

select is(
  (select note from public.bowl_movies where id = '20000000-0000-0000-0000-000000000309'),
  'Pinned note',
  'giving up the pin does not cost the note'
);

-- The window is the server's, measured from the commit time it wrote.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000309',
      'UTC',
      '30000000-0000-0000-0000-000000000305'
    )
  $$,
  'a second solo draw of a restored copy is recorded'
);

reset role;

select set_config(
  'test.auto_stale_entry_id',
  (select id::text from public.user_watch_events
    where request_id = '30000000-0000-0000-0000-000000000305'),
  true
);

update public.user_watch_events
set created_at = now() - interval '3 hours'
where id = current_setting('test.auto_stale_entry_id')::uuid;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  format($$select public.undo_solo_draw(%L)$$, current_setting('test.auto_stale_entry_id')),
  'P0001',
  'This draw can no longer be undone.',
  'undo is refused once the two hours are up'
);

select lives_ok(
  format($$select public.delete_user_watch_event(%L)$$, current_setting('test.auto_stale_entry_id')),
  'ordinary deletion still works after the window'
);

reset role;

select is(
  (select count(*)::integer from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000309'),
  0,
  'deleting after the window leaves the removed copies removed'
);

-- A retry of a draw the caller never saw the answer to must not remove twice.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000310',
      'UTC',
      '30000000-0000-0000-0000-000000000306'
    )
  $$,
  'a draw of the remaining pin bowl title is recorded'
);

reset role;

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values ('20000000-0000-0000-0000-000000000312', '10000000-0000-0000-0000-000000000306',
  '00000000-0000-0000-0000-000000000301', 40310, 'Auto Replacement Pin');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000310',
      'UTC',
      '30000000-0000-0000-0000-000000000306'
    )
  $$,
  'replaying the same request id returns the first draw'
);

reset role;

select is(
  (select count(*)::integer from public.solo_draw_removed_copies
    where watch_event_id = (
      select id from public.user_watch_events
      where request_id = '30000000-0000-0000-0000-000000000306'
    )),
  1,
  'a replayed draw removes nothing a second time'
);

select is(
  (select count(*)::integer from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000312'),
  1,
  'the copy added after the first attempt survives the replay'
);

-- Entries with nothing to restore keep deleting as they always have.
insert into public.user_watch_events (user_id, source_kind, title, watched_on)
values ('00000000-0000-0000-0000-000000000301', 'manual', 'Auto Manual', current_date);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"auto-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$
    select public.delete_user_watch_event(
      (select id from public.user_watch_events
        where user_id = '00000000-0000-0000-0000-000000000301'
          and source_kind = 'manual'
          and title = 'Auto Manual')
    )
  $$,
  'a manual entry still deletes without ceremony'
);

select is(
  (
    select public.undo_solo_draw(
      (select id from public.user_watch_events
        where request_id = '30000000-0000-0000-0000-000000000301')
    ) ->> 'restored'
  )::integer,
  0,
  'undoing a draw made with the setting off restores nothing and still deletes the entry'
);

reset role;

select is(
  (select count(*)::integer from public.user_watch_events
    where request_id = '30000000-0000-0000-0000-000000000301'),
  0,
  'the entry from the setting-off draw is gone'
);

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000271', 'reaction-owner@example.com'),
  ('00000000-0000-0000-0000-000000000272', 'reaction-member@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000271',
  '00000000-0000-0000-0000-000000000272'
);

insert into public.bowls (id, name, owner_id, draw_method)
values (
  '10000000-0000-0000-0000-000000000271',
  'Reaction Bowl',
  '00000000-0000-0000-0000-000000000271',
  'person_first'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000271', '00000000-0000-0000-0000-000000000271', 'Owner'),
  ('10000000-0000-0000-0000-000000000271', '00000000-0000-0000-0000-000000000272', 'Member');

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title, note)
values
  (
    '20000000-0000-0000-0000-000000000271',
    '10000000-0000-0000-0000-000000000271',
    '00000000-0000-0000-0000-000000000272',
    27101,
    'Group Reaction Movie',
    'Sam swears by it.'
  ),
  (
    '20000000-0000-0000-0000-000000000272',
    '10000000-0000-0000-0000-000000000271',
    '00000000-0000-0000-0000-000000000271',
    27102,
    'Solo Reaction Movie',
    'Saw the trailer twice.'
  );

select has_column('public', 'user_watch_events', 'personal_note', 'watch events have a personal comment column');
select col_type_is('public', 'user_watch_events', 'personal_note', 'text', 'personal comments are text');

select ok(
  has_function_privilege('authenticated', 'public.update_own_watch_event_note(uuid,text)', 'EXECUTE'),
  'signed-in users can call the in-place comment RPC'
);

select ok(
  not has_function_privilege('anon', 'public.update_own_watch_event_note(uuid,text)', 'EXECUTE'),
  'anonymous users cannot call the in-place comment RPC'
);

select ok(
  not has_function_privilege('anon', 'public.update_user_watch_event(uuid,text,date,date,text,boolean)', 'EXECUTE'),
  'anonymous users cannot call the history update RPC'
);

select is(
  to_regprocedure('public.update_user_watch_event(uuid,text,date,date,text)'),
  null::regprocedure,
  'the superseded history-update signature is removed, so no call is ambiguous'
);

select throws_ok(
  $sql$
    insert into public.user_watch_events (user_id, source_kind, title, watched_on, note)
    values ('00000000-0000-0000-0000-000000000271', 'manual', 'Bad Manual', '2026-09-27', 'A reason')
  $sql$,
  '23514',
  null,
  'a manual entry cannot carry a reason it was in a bowl'
);

select throws_ok(
  $sql$
    insert into public.user_watch_events (user_id, source_kind, title, watched_on, personal_note)
    values ('00000000-0000-0000-0000-000000000271', 'manual', 'Too Long', '2026-09-27', repeat('x', 501))
  $sql$,
  '23514',
  null,
  'the database caps a personal comment at 500 characters'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000271","email":"reaction-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000271', true);

select lives_ok(
  $sql$ select public.draw_bowl_movie('20000000-0000-0000-0000-000000000271') $sql$,
  'the owner draws a slip with a reason'
);

select results_eq(
  $sql$
    select note, personal_note
    from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
  $sql$,
  $sql$ values ('Sam swears by it.'::text, null::text) $sql$,
  'a draw copies the reason and starts with no personal comment'
);

-- An older client edits a drawn entry without sending a comment at all. It
-- must not erase the one written since.
select lives_ok(
  $sql$
    select public.update_own_watch_event_note(
      (select id from public.user_watch_events where tmdb_id = 27101 and source_kind = 'bowl_draw'),
      E'  Better than I expected.\nThe ending!  '
    )
  $sql$,
  'the watcher adds a comment in place to a drawn entry'
);

select results_eq(
  $sql$
    select title, note, personal_note
    from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
  $sql$,
  $sql$ values ('Group Reaction Movie'::text, 'Sam swears by it.'::text, E'Better than I expected.\nThe ending!'::text) $sql$,
  'the in-place comment is trimmed and leaves the reason and title alone'
);

select lives_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (select id from public.user_watch_events where tmdb_id = 27101 and source_kind = 'bowl_draw'),
      p_title => 'Group Reaction Movie',
      p_watched_on => '2026-09-26'
    )
  $sql$,
  'an older client edits the date of a drawn entry'
);

select is(
  (select personal_note from public.user_watch_events where tmdb_id = 27101 and source_kind = 'bowl_draw'),
  E'Better than I expected.\nThe ending!',
  'an edit that does not claim the comment keeps it'
);

select lives_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (select id from public.user_watch_events where tmdb_id = 27101 and source_kind = 'bowl_draw'),
      p_title => 'Group Reaction Movie',
      p_watched_on => '2026-09-26',
      p_note => 'Rewritten from the history editor',
      p_set_personal_note => true
    )
  $sql$,
  'the history editor saves a comment on a drawn entry'
);

select results_eq(
  $sql$
    select note, personal_note
    from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
  $sql$,
  $sql$ values ('Sam swears by it.'::text, 'Rewritten from the history editor'::text) $sql$,
  'the editor writes the personal comment and never the reason'
);

select throws_ok(
  $sql$
    select public.update_own_watch_event_note(
      (select id from public.user_watch_events where tmdb_id = 27101 and source_kind = 'bowl_draw'),
      repeat('x', 501)
    )
  $sql$,
  '22001',
  'Comment must be 500 characters or fewer.',
  'an over-limit comment is refused with a readable message'
);

select lives_ok(
  $sql$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000272',
      'UTC',
      '40000000-0000-0000-0000-000000000271'
    )
  $sql$,
  'the owner draws their own slip alone'
);

select lives_ok(
  $sql$
    select public.update_own_watch_event_note(
      (select id from public.user_watch_events where tmdb_id = 27102 and source_kind = 'solo_draw'),
      'Fell asleep halfway.'
    )
  $sql$,
  'a solo entry takes a personal comment too'
);

select results_eq(
  $sql$
    select note, personal_note
    from public.user_watch_events
    where tmdb_id = 27102 and source_kind = 'solo_draw'
  $sql$,
  $sql$ values ('Saw the trailer twice.'::text, 'Fell asleep halfway.'::text) $sql$,
  'a solo entry keeps its reason beside the comment'
);

select lives_ok(
  $sql$
    select public.create_manual_watch_event(
      p_title => 'Logged By Hand',
      p_watched_on => '2026-09-20',
      p_note => '  Rainy Sunday pick.  '
    )
  $sql$,
  'a manual entry is created with a comment'
);

select results_eq(
  $sql$ select note, personal_note from public.user_watch_events where title = 'Logged By Hand' $sql$,
  $sql$ values (null::text, 'Rainy Sunday pick.'::text) $sql$,
  'a manual comment is the personal comment, and the entry has no reason'
);

select lives_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (select id from public.user_watch_events where title = 'Logged By Hand'),
      p_title => 'Logged By Hand',
      p_watched_on => '2026-09-20',
      p_note => '   '
    )
  $sql$,
  'an older client clears a manual comment the way it always has'
);

select is(
  (select personal_note from public.user_watch_events where title = 'Logged By Hand'),
  null::text,
  'a blank manual comment is stored as null'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000272","email":"reaction-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000272', true);

select results_eq(
  $sql$
    select note, personal_note
    from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
  $sql$,
  $sql$ values ('Sam swears by it.'::text, null::text) $sql$,
  'another participant sees the same reason and only their own, empty, comment'
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events
    where user_id = '00000000-0000-0000-0000-000000000271'
  ),
  0,
  'nobody can read another person''s comments'
);

select lives_ok(
  $sql$
    select public.update_own_watch_event_note(
      (
        select id from public.user_watch_events
        where tmdb_id = 27101 and source_kind = 'bowl_draw'
          and user_id = '00000000-0000-0000-0000-000000000272'
      ),
      'My own take'
    )
  $sql$,
  'each participant comments on their own entry'
);

reset role;

select results_eq(
  $sql$
    select user_id, personal_note
    from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
    order by user_id
  $sql$,
  $sql$
    values
      ('00000000-0000-0000-0000-000000000271'::uuid, 'Rewritten from the history editor'::text),
      ('00000000-0000-0000-0000-000000000272'::uuid, 'My own take'::text)
  $sql$,
  'two people watching the same draw keep separate comments'
);

select set_config(
  'test.owner_event',
  (
    select id::text from public.user_watch_events
    where tmdb_id = 27101 and source_kind = 'bowl_draw'
      and user_id = '00000000-0000-0000-0000-000000000271'
  ),
  true
);

set local role authenticated;

select throws_ok(
  $sql$
    select public.update_own_watch_event_note(
      current_setting('test.owner_event')::uuid,
      'Not mine to write'
    )
  $sql$,
  'P0001',
  'This history entry is no longer available.',
  'a participant cannot write someone else''s comment in place'
);

select throws_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => current_setting('test.owner_event')::uuid,
      p_title => 'Stolen',
      p_watched_on => '2026-09-26',
      p_note => 'Not mine',
      p_set_personal_note => true
    )
  $sql$,
  'P0001',
  'This history entry is no longer available.',
  'a participant cannot write someone else''s comment through the editor'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $sql$ select public.update_own_watch_event_note('00000000-0000-0000-0000-000000000000', 'x') $sql$,
  '42501',
  null,
  'an anonymous caller cannot write a comment'
);

select * from finish();
rollback;

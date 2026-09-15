begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000201', 'solo-owner@example.com'),
  ('00000000-0000-0000-0000-000000000202', 'solo-friend@example.com'),
  ('00000000-0000-0000-0000-000000000203', 'solo-stranger@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000203'
);

insert into public.bowls (id, name, owner_id)
values
  (
    '10000000-0000-0000-0000-000000000201',
    'Solo Own Bowl',
    '00000000-0000-0000-0000-000000000201'
  ),
  (
    '10000000-0000-0000-0000-000000000202',
    'Solo Shared Bowl',
    '00000000-0000-0000-0000-000000000202'
  ),
  (
    '10000000-0000-0000-0000-000000000203',
    'Solo Stranger Bowl',
    '00000000-0000-0000-0000-000000000203'
  );

insert into public.bowl_members (bowl_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000201',
  'Member'
);

insert into public.bowl_movies (
  id,
  bowl_id,
  added_by,
  added_by_name,
  tmdb_id,
  title,
  note,
  is_pinned,
  drawn_at,
  drawn_by
)
values
  (
    '20000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    null,
    30201,
    'Solo Pick',
    'Solo bowl note',
    true,
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000202',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    null,
    -30202,
    'Solo Custom Pick',
    null,
    false,
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000203',
    '10000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000202',
    null,
    30203,
    'Someone Else Pick',
    null,
    false,
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000204',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    null,
    30204,
    'Already Drawn Pick',
    null,
    false,
    now(),
    '00000000-0000-0000-0000-000000000201'
  ),
  (
    '20000000-0000-0000-0000-000000000205',
    '10000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000201',
    null,
    30205,
    'Former Member Pick',
    null,
    false,
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000206',
    '10000000-0000-0000-0000-000000000201',
    null,
    'Guest',
    30206,
    'Public Link Pick',
    null,
    false,
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000207',
    '10000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000201',
    null,
    30207,
    'Shared Bowl Pick',
    null,
    false,
    null,
    null
  );

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_solo_draw(uuid, text, uuid)',
    'execute'
  ),
  'signed-in callers can record a solo draw'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.record_solo_draw(uuid, text, uuid)',
    'execute'
  ),
  'anonymous callers cannot record a solo draw'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000201","email":"solo-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  true
);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000201',
      'UTC',
      '30000000-0000-0000-0000-000000000201'
    )
  $$,
  'a member can draw their own undrawn slip solo'
);

reset role;

select set_config(
  'test.solo_entry_id',
  (
    select id::text
    from public.user_watch_events
    where request_id = '30000000-0000-0000-0000-000000000201'
  ),
  true
);

select ok(
  (
    select source_kind = 'solo_draw'
      and user_id = '00000000-0000-0000-0000-000000000201'
      and source_bowl_movie_id = '20000000-0000-0000-0000-000000000201'
      and source_bowl_id = '10000000-0000-0000-0000-000000000201'
      and bowl_name = 'Solo Own Bowl'
      and tmdb_id = 30201
      and title = 'Solo Pick'
      and note = 'Solo bowl note'
      and watched_on = (now() at time zone 'UTC')::date
    from public.user_watch_events
    where id = current_setting('test.solo_entry_id')::uuid
  ),
  'the entry is the caller own solo draw, snapshotted from the slip'
);

-- The whole point of the feature: the bowl is exactly as it was.
select ok(
  (
    select drawn_at is null
      and drawn_by is null
      and is_pinned
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000201'
  ),
  'a solo draw leaves the slip undrawn and still pinned'
);

select is(
  (
    select count(*)::integer
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000201'
  ),
  0,
  'a solo draw writes no bowl activity'
);

-- A retry of an answer the caller never saw must not draw a second movie.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  true
);

select is(
  (
    select (
      public.record_solo_draw(
        '20000000-0000-0000-0000-000000000201',
        'UTC',
        '30000000-0000-0000-0000-000000000201'
      )
    ).id::text
  ),
  current_setting('test.solo_entry_id'),
  'replaying a request id returns the original entry'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000202',
      'UTC',
      '30000000-0000-0000-0000-000000000201'
    )
  $$,
  'P0001',
  'This draw was already recorded for a different movie.',
  'reusing a request id for another movie is refused'
);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000202',
      'UTC',
      '30000000-0000-0000-0000-000000000202'
    )
  $$,
  'a custom title with a negative synthetic tmdb_id can be drawn solo'
);

select lives_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000207',
      'UTC',
      '30000000-0000-0000-0000-000000000203'
    )
  $$,
  'a member can draw their own slip out of somebody else bowl'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000203',
      'UTC',
      '30000000-0000-0000-0000-000000000204'
    )
  $$,
  'P0001',
  'This movie is no longer available to draw.',
  'somebody else slip cannot be drawn solo'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000204',
      'UTC',
      '30000000-0000-0000-0000-000000000205'
    )
  $$,
  'P0001',
  'This movie is no longer available to draw.',
  'an already drawn slip cannot be drawn solo'
);

-- Knowing a row uuid you created is not access: the bowl is somebody else's now.
select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000205',
      'UTC',
      '30000000-0000-0000-0000-000000000206'
    )
  $$,
  'P0001',
  'This movie is no longer available to draw.',
  'a slip in a bowl the caller no longer belongs to cannot be drawn solo'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000206',
      'UTC',
      '30000000-0000-0000-0000-000000000207'
    )
  $$,
  'P0001',
  'This movie is no longer available to draw.',
  'a public link slip is nobody own slip to draw solo'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000201',
      'UTC',
      null
    )
  $$,
  'P0001',
  'A draw request id is required.',
  'a draw without a request id is refused'
);

select throws_ok(
  $$
    select public.record_solo_draw(
      '20000000-0000-0000-0000-000000000201',
      'Mars/Olympus_Mons',
      '30000000-0000-0000-0000-000000000208'
    )
  $$,
  '22023',
  'The watched timezone is not recognized.',
  'an unrecognized timezone is refused'
);

-- The note is the slip's reason for being in the bowl, not the caller's own
-- comment, so it stays as drawn while the date and title remain editable.
select lives_ok(
  $$
    select public.update_user_watch_event(
      current_setting('test.solo_entry_id')::uuid,
      'Solo Pick (edited)',
      current_date,
      null,
      'Trying to rewrite the bowl note'
    )
  $$,
  'a solo entry title and date can be edited'
);

reset role;

select ok(
  (
    select note = 'Solo bowl note'
      and title = 'Solo Pick (edited)'
    from public.user_watch_events
    where id = current_setting('test.solo_entry_id')::uuid
  ),
  'editing a solo entry cannot rewrite the drawn note'
);

-- Privacy is the existing RLS, unchanged: the record exists and nobody else
-- can see it.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000202","email":"solo-friend@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000202',
  true
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events
    where id = current_setting('test.solo_entry_id')::uuid
  ),
  0,
  'another member cannot read the solo entry'
);

select throws_ok(
  $$
    select public.delete_user_watch_event(
      current_setting('test.solo_entry_id')::uuid
    )
  $$,
  'P0001',
  'This history entry is no longer available.',
  'another member cannot delete the solo entry'
);

-- Undo and ordinary removal are the same act here, because no bowl changed.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000201","email":"solo-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000201',
  true
);

select lives_ok(
  $$
    select public.delete_user_watch_event(
      current_setting('test.solo_entry_id')::uuid
    )
  $$,
  'the owner of a solo entry can delete it'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_watch_events
    where id = current_setting('test.solo_entry_id')::uuid
  ),
  0,
  'deleting a solo entry removes it'
);

select ok(
  (
    select drawn_at is null
      and is_pinned
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000201'
  ),
  'deleting a solo entry leaves the slip alone, because the draw never touched it'
);

-- Shape constraints: a solo row cannot masquerade as a manual one, and a manual
-- row cannot claim a source it never had.
select throws_ok(
  $$
    insert into public.user_watch_events (user_id, source_kind, title, watched_on)
    values (
      '00000000-0000-0000-0000-000000000201',
      'solo_draw',
      'Untraceable Solo',
      current_date
    )
  $$,
  '23514',
  null,
  'a solo entry without a request id is rejected'
);

select throws_ok(
  $$
    insert into public.user_watch_events (
      user_id,
      source_kind,
      source_bowl_movie_id,
      title,
      watched_on
    )
    values (
      '00000000-0000-0000-0000-000000000201',
      'manual',
      '20000000-0000-0000-0000-000000000201',
      'Manual With A Source',
      current_date
    )
  $$,
  '23514',
  null,
  'a manual entry cannot carry a solo source row'
);

select * from finish();
rollback;

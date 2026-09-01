begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000101', 'return-owner@example.com'),
  ('00000000-0000-0000-0000-000000000102', 'return-member@example.com'),
  ('00000000-0000-0000-0000-000000000103', 'return-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103'
);

insert into public.bowls (id, name, owner_id)
values
  (
    '10000000-0000-0000-0000-000000000101',
    'Return Window Bowl',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    'Full Return Bowl',
    '00000000-0000-0000-0000-000000000101'
  );

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000102',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000102',
    'Member'
  );

insert into public.bowl_movies (
  id,
  bowl_id,
  added_by,
  tmdb_id,
  title,
  note
)
values
  (
    '20000000-0000-0000-0000-000000000101',
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    10101,
    'Recent Return',
    'Recent bowl note'
  ),
  (
    '20000000-0000-0000-0000-000000000102',
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    10102,
    'Boundary Return',
    'Boundary bowl note'
  ),
  (
    '20000000-0000-0000-0000-000000000103',
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    10103,
    'Older Return',
    'Older bowl note'
  ),
  (
    '20000000-0000-0000-0000-000000000104',
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000101',
    10104,
    'Duplicate Return',
    'Duplicate bowl note'
  ),
  (
    '20000000-0000-0000-0000-000000000105',
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000101',
    10105,
    'Capacity Return',
    'Capacity bowl note'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","email":"return-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select public.draw_bowl_movie(
  '20000000-0000-0000-0000-000000000101',
  'UTC'
);
select public.draw_bowl_movie(
  '20000000-0000-0000-0000-000000000102',
  'UTC'
);
select public.draw_bowl_movie(
  '20000000-0000-0000-0000-000000000103',
  'UTC'
);
select public.draw_bowl_movie(
  '20000000-0000-0000-0000-000000000104',
  'UTC'
);
select public.draw_bowl_movie(
  '20000000-0000-0000-0000-000000000105',
  'UTC'
);

reset role;

-- Preserve fixture IDs outside RLS-filtered tables so each role exercises the
-- RPC with the intended draw event instead of accidentally passing null.
select set_config(
  'test.return_recent_draw_event_id',
  (
    select id::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000101'
  ),
  true
);
select set_config(
  'test.return_boundary_draw_event_id',
  (
    select id::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000102'
  ),
  true
);
select set_config(
  'test.return_older_draw_event_id',
  (
    select id::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000103'
  ),
  true
);
select set_config(
  'test.return_duplicate_draw_event_id',
  (
    select id::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000104'
  ),
  true
);
select set_config(
  'test.return_capacity_draw_event_id',
  (
    select id::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000105'
  ),
  true
);

update public.bowl_draw_events
set drawn_at = case source_bowl_movie_id
  when '20000000-0000-0000-0000-000000000101'::uuid
    then now() - interval '1 hour 59 minutes'
  when '20000000-0000-0000-0000-000000000102'::uuid
    then now() - interval '2 hours'
  when '20000000-0000-0000-0000-000000000103'::uuid
    then now() - interval '2 hours 1 minute'
  else now() - interval '1 hour'
end
where source_bowl_movie_id in (
  '20000000-0000-0000-0000-000000000101',
  '20000000-0000-0000-0000-000000000102',
  '20000000-0000-0000-0000-000000000103',
  '20000000-0000-0000-0000-000000000104',
  '20000000-0000-0000-0000-000000000105'
);

insert into public.user_watch_events (
  user_id,
  source_kind,
  title,
  watched_on
)
values (
  '00000000-0000-0000-0000-000000000101',
  'manual',
  'Unrelated manual history',
  current_date
);

-- Editing a recent generated row deliberately does not opt it out of the
-- group undo window.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000102","email":"return-member@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000102',
  true
);

select public.update_user_watch_event(
  (
    select history.id
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000101'
      and history.user_id = '00000000-0000-0000-0000-000000000102'
  ),
  'Recent Return (edited)',
  current_date,
  null
);

select lives_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_recent_draw_event_id')::uuid
    )
  $$,
  'a member can undo a draw inside the two-hour window'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000101'
  ),
  0,
  'a recent return removes every generated history row, including an edited one'
);

select is(
  (
    select count(*)::integer
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000101'
      and tmdb_id = 10101
      and drawn_at is null
  ),
  1,
  'a recent return restores exactly one active bowl slip'
);

select is(
  (
    select note
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000101'
      and tmdb_id = 10101
      and drawn_at is null
  ),
  'Recent bowl note',
  'a recent return restores the snapshotted bowl note'
);

select ok(
  (
    select event.returned_at = now()
      and event.returned_by = '00000000-0000-0000-0000-000000000102'
    from public.bowl_draw_events event
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000101'
  ),
  'the return records the same transaction timestamp and the returning member'
);

-- Exactly two hours is included in the undo window.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","email":"return-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select lives_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_boundary_draw_event_id')::uuid
    )
  $$,
  'the exact two-hour boundary remains part of the undo window'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000102'
  ),
  0,
  'the exact two-hour boundary removes generated history'
);

-- Older returns restore the bowl without rewriting personal history.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000103","email":"return-outsider@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000103',
  true
);

select throws_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_older_draw_event_id')::uuid
    )
  $$,
  '42501',
  'You do not have permission to move this movie to the bowl.',
  'an outsider cannot return an older draw'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000101","email":"return-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select lives_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_older_draw_event_id')::uuid
    )
  $$,
  'an owner can return a draw after the undo window'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000103'
  ),
  2,
  'an older return preserves every participant history row'
);

select is(
  (
    select count(*)::integer
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000101'
      and tmdb_id = 10103
      and drawn_at is null
  ),
  1,
  'an older return still restores exactly one active bowl slip'
);

select is(
  (
    select note
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000101'
      and tmdb_id = 10103
      and drawn_at is null
  ),
  'Older bowl note',
  'an older return restores the snapshotted bowl note'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select throws_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_older_draw_event_id')::uuid
    )
  $$,
  'P0001',
  'This draw is no longer available to move to the bowl.',
  'a returned draw cannot be returned twice'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.user_watch_events
    where source_kind = 'manual'
      and title = 'Unrelated manual history'
  ),
  1,
  'draw returns never remove unrelated manual history'
);

-- Active duplicate protection runs before return metadata or history cleanup.
insert into public.bowl_movies (
  bowl_id,
  added_by,
  tmdb_id,
  title
)
values (
  '10000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101',
  10104,
  'Duplicate Return'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select throws_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_duplicate_draw_event_id')::uuid
    )
  $$,
  '23505',
  'This movie is already in the bowl.',
  'an active duplicate blocks the return'
);

reset role;

select ok(
  (
    select returned_at is null
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000104'
  ),
  'a duplicate failure leaves the draw active'
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000104'
  ),
  2,
  'a duplicate failure leaves generated history intact'
);

-- Capacity protection also runs before return metadata or history cleanup.
insert into public.bowl_movies (
  bowl_id,
  added_by,
  tmdb_id,
  title
)
select
  '10000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101',
  20000 + number,
  'Capacity filler ' || number
from generate_series(1, 500) number;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

select throws_ok(
  $$
    select public.return_bowl_draw_to_bowl(
      current_setting('test.return_capacity_draw_event_id')::uuid
    )
  $$,
  'P0001',
  'Bowl is at the undrawn movie limit (500).',
  'a full bowl blocks the return'
);

reset role;

select ok(
  (
    select returned_at is null
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000105'
  ),
  'a capacity failure leaves the draw active'
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event
      on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000105'
  ),
  2,
  'a capacity failure leaves generated history intact'
);

select * from finish();
rollback;

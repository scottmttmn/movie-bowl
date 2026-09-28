begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000701', 'queue-owner@example.com'),
  ('00000000-0000-0000-0000-000000000702', 'queue-member@example.com'),
  ('00000000-0000-0000-0000-000000000703', 'queue-new-member@example.com'),
  ('00000000-0000-0000-0000-000000000704', 'queue-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-0000000007%';

insert into public.bowls (id, name, owner_id, draw_method)
values
  ('10000000-0000-0000-0000-000000000701', 'Queue Rotation', '00000000-0000-0000-0000-000000000701', 'rotation'),
  ('10000000-0000-0000-0000-000000000702', 'Queue Pack Only', '00000000-0000-0000-0000-000000000701', 'rotation');

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (
  values
    ('00000000-0000-0000-0000-000000000701'::uuid, 'Owner'::text),
    ('00000000-0000-0000-0000-000000000702'::uuid, 'Member'::text),
    ('00000000-0000-0000-0000-000000000703'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id::text like '10000000-0000-0000-0000-0000000007%';

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000701', '10000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000701', null, 70001, 'Owner Title'),
  ('20000000-0000-0000-0000-000000000702', '10000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000702', null, 70002, 'Member Title'),
  ('20000000-0000-0000-0000-000000000703', '10000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000703', null, 70003, 'New Member Title'),
  ('20000000-0000-0000-0000-000000000704', '10000000-0000-0000-0000-000000000701', null, 'Gil', 70004, 'Guest Title');

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000711', '10000000-0000-0000-0000-000000000702', null, 'Nolan: The ''00s', 'nolan-2000s', 71001, 'Only Pack Slip');

update public.bowls
set starter_pack = 'nolan-2000s', starter_pack_installed_at = now()
where id = '10000000-0000-0000-0000-000000000702';

-- The member was drawn in January and the owner in February, the owner's
-- draw since returned. Returned draws still count, so the owner is last in
-- line; the new member and the guest have never been drawn and tie at the
-- front.
insert into public.bowl_draw_events (bowl_id, bowl_name, added_by, drawn_by, tmdb_id, title, drawn_at, returned_at)
values
  ('10000000-0000-0000-0000-000000000701', 'Queue Rotation', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000701', 70901, 'Member History', '2026-01-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000701', 'Queue Rotation', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000701', 70902, 'Owner History', '2026-02-01T00:00:00Z', '2026-02-01T01:00:00Z');

-- Shape

select is(
  (
    select array_to_string(proargnames[4:8], ',')
    from pg_proc
    where oid = 'public.draw_bowl_movie_by_rotation(uuid,uuid[],text)'::regprocedure
  ),
  'bowl_movie_id,draw_event_id,drawn_at,turn_bucket_key,rotation_queue',
  'the rotation draw returns the turn it spent and its queue after the draw columns'
);
select ok(
  (select prosecdef and proconfig = array['search_path=public']
   from pg_proc
   where oid = 'public.draw_bowl_movie_by_rotation(uuid,uuid[],text)'::regprocedure),
  'the rotation draw stays security definer with a fixed search path'
);
select ok(
  has_function_privilege('authenticated', 'public.draw_bowl_movie_by_rotation(uuid,uuid[],text)', 'EXECUTE'),
  'signed-in callers can still draw by rotation'
);
select ok(
  not has_function_privilege('anon', 'public.draw_bowl_movie_by_rotation(uuid,uuid[],text)', 'EXECUTE'),
  'anonymous callers still cannot'
);

-- Who may

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000704","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000704', true);
select throws_ok(
  $$ select * from public.draw_bowl_movie_by_rotation(
       '10000000-0000-0000-0000-000000000701',
       array['20000000-0000-0000-0000-000000000701']::uuid[],
       'UTC') $$,
  '42501',
  'You do not have permission to draw in this bowl.',
  'an outsider still cannot draw, so cannot read the queue'
);
reset role;

-- The queue

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000702","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);

create temporary table drawn on commit drop as
select *
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000701',
  array[
    '20000000-0000-0000-0000-000000000701',
    '20000000-0000-0000-0000-000000000702',
    '20000000-0000-0000-0000-000000000703',
    '20000000-0000-0000-0000-000000000704'
  ]::uuid[],
  'UTC'
);
reset role;

select is((select count(*)::int from drawn), 1, 'one row comes back');
select is(
  (select jsonb_array_length(rotation_queue) from drawn),
  4,
  'the queue holds every eligible person once'
);
select is(
  (select turn_bucket_key from drawn),
  (select rotation_queue -> 0 ->> 'bucket_key' from drawn),
  'the turn spent is the front of the queue'
);
select is(
  (
    select array_agg(entry ->> 'bucket_key' order by entry ->> 'bucket_key')
    from drawn, jsonb_array_elements(rotation_queue) with ordinality as queue(entry, position)
    where position <= 2
  ),
  array['guest:gil', 'user:00000000-0000-0000-0000-000000000703'],
  'the never-drawn tie comes first, in either order'
);
select is(
  (
    select array_agg(entry ->> 'bucket_key' order by position)
    from drawn, jsonb_array_elements(rotation_queue) with ordinality as queue(entry, position)
    where position > 2
  ),
  array['user:00000000-0000-0000-0000-000000000702', 'user:00000000-0000-0000-0000-000000000701'],
  'then least recently drawn, a returned draw still counting'
);
select is(
  (
    select array_agg((entry ->> 'never_drawn')::boolean order by position)
    from drawn, jsonb_array_elements(rotation_queue) with ordinality as queue(entry, position)
  ),
  array[true, true, false, false],
  'each place says whether that person has ever been drawn'
);
select is(
  (
    select array_agg(distinct key order by key)
    from drawn, jsonb_array_elements(rotation_queue) entry, jsonb_object_keys(entry) key
  ),
  array['bucket_key', 'never_drawn'],
  'the queue carries order and a flag, never a date'
);
select is(
  (select turn_bucket_key from public.bowl_draw_events where id = (select draw_event_id from drawn)),
  (select turn_bucket_key from drawn),
  'the turn returned is the turn recorded'
);
select is(
  (
    select public._bowl_contributor_bucket_key(movie.added_by, movie.added_by_name, movie.starter_pack)
    from public.bowl_movies movie
    where movie.id = (select bowl_movie_id from drawn)
  ),
  (select turn_bucket_key from drawn),
  'the drawn slip belongs to the turn returned'
);

-- A pack-only pool spends nobody's turn and has nobody to line up.

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
select results_eq(
  $$ select bowl_movie_id, turn_bucket_key, rotation_queue
     from public.draw_bowl_movie_by_rotation(
       '10000000-0000-0000-0000-000000000702',
       array['20000000-0000-0000-0000-000000000711']::uuid[],
       'UTC') $$,
  $$ values ('20000000-0000-0000-0000-000000000711'::uuid, null::text, '[]'::jsonb) $$,
  'a pack-only draw returns no turn and an empty queue'
);
reset role;

select * from finish();
rollback;

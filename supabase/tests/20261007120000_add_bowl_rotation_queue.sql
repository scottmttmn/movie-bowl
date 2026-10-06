begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000901', 'line-owner@example.com'),
  ('00000000-0000-0000-0000-000000000902', 'line-member@example.com'),
  ('00000000-0000-0000-0000-000000000903', 'line-new-member@example.com'),
  ('00000000-0000-0000-0000-000000000904', 'line-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-0000000009%';

insert into public.bowls (id, name, owner_id, draw_method)
values
  ('10000000-0000-0000-0000-000000000901', 'Line Rotation', '00000000-0000-0000-0000-000000000901', 'rotation'),
  ('10000000-0000-0000-0000-000000000902', 'Line Pack Only', '00000000-0000-0000-0000-000000000901', 'rotation'),
  ('10000000-0000-0000-0000-000000000903', 'Line Person First', '00000000-0000-0000-0000-000000000901', 'person_first');

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (
  values
    ('00000000-0000-0000-0000-000000000901'::uuid, 'Owner'::text),
    ('00000000-0000-0000-0000-000000000902'::uuid, 'Member'::text),
    ('00000000-0000-0000-0000-000000000903'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id::text like '10000000-0000-0000-0000-0000000009%';

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000901', '10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901', null, 90001, 'Owner Title'),
  ('20000000-0000-0000-0000-000000000902', '10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000902', null, 90002, 'Member Title'),
  ('20000000-0000-0000-0000-000000000903', '10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', null, 90003, 'New Member Title'),
  ('20000000-0000-0000-0000-000000000904', '10000000-0000-0000-0000-000000000901', null, 'Gil', 90004, 'Guest Title'),
  -- Second titles for the two who tie, so whoever the draw picks is still
  -- in the pool afterwards.
  ('20000000-0000-0000-0000-000000000905', '10000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000903', null, 90005, 'New Member Second'),
  ('20000000-0000-0000-0000-000000000906', '10000000-0000-0000-0000-000000000901', null, 'Gil', 90006, 'Guest Second'),
  ('20000000-0000-0000-0000-000000000931', '10000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000902', null, 93001, 'Person First Title');

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000902', null, 'Nolan: The ''00s', 'nolan-2000s', 91001, 'Only Pack Slip');

update public.bowls
set starter_pack = 'nolan-2000s', starter_pack_installed_at = now()
where id = '10000000-0000-0000-0000-000000000902';

-- The member was drawn in January and the owner in February, the owner's draw
-- since returned. Returned draws still count, so the owner is last in line;
-- the new member and the guest have never been drawn and tie at the front.
insert into public.bowl_draw_events (bowl_id, bowl_name, added_by, drawn_by, tmdb_id, title, drawn_at, returned_at)
values
  ('10000000-0000-0000-0000-000000000901', 'Line Rotation', '00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000901', 90901, 'Member History', '2026-01-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000901', 'Line Rotation', '00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000901', 90902, 'Owner History', '2026-02-01T00:00:00Z', '2026-02-01T01:00:00Z');

-- Shape

select ok(
  (select prosecdef and proconfig = array['search_path=public']
   from pg_proc
   where oid = 'public.get_bowl_rotation_queue(uuid,uuid[])'::regprocedure),
  'the queue read is security definer with a fixed search path'
);
select ok(
  has_function_privilege('authenticated', 'public.get_bowl_rotation_queue(uuid,uuid[])', 'EXECUTE'),
  'signed-in callers can read the queue'
);
select ok(
  not has_function_privilege('anon', 'public.get_bowl_rotation_queue(uuid,uuid[])', 'EXECUTE'),
  'anonymous callers cannot'
);
select is(
  (
    select array_to_string(proargnames[3:4], ',')
    from pg_proc
    where oid = 'public.get_bowl_rotation_queue(uuid,uuid[])'::regprocedure
  ),
  'bucket_key,never_drawn',
  'the queue carries order and a flag, never a date'
);

-- Who may

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000904","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000904', true);
select throws_ok(
  $$ select * from public.get_bowl_rotation_queue(
       '10000000-0000-0000-0000-000000000901',
       array['20000000-0000-0000-0000-000000000901']::uuid[]) $$,
  '42501',
  'You do not have access to this bowl.',
  'an outsider cannot read the queue'
);
reset role;

-- The order, read by a member

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);

create temporary table line on commit drop as
select row_number() over () as position, queue.*
from public.get_bowl_rotation_queue(
  '10000000-0000-0000-0000-000000000901',
  array[
    '20000000-0000-0000-0000-000000000901',
    '20000000-0000-0000-0000-000000000902',
    '20000000-0000-0000-0000-000000000903',
    '20000000-0000-0000-0000-000000000904'
  ]::uuid[]
) queue;

create temporary table narrowed on commit drop as
select *
from public.get_bowl_rotation_queue(
  '10000000-0000-0000-0000-000000000901',
  array[
    '20000000-0000-0000-0000-000000000901',
    '20000000-0000-0000-0000-000000000902'
  ]::uuid[]
);

create temporary table drawn on commit drop as
select *
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000901',
  array[
    '20000000-0000-0000-0000-000000000901',
    '20000000-0000-0000-0000-000000000902',
    '20000000-0000-0000-0000-000000000903',
    '20000000-0000-0000-0000-000000000904'
  ]::uuid[],
  'UTC'
);
reset role;

select is(
  (select array_agg(bucket_key order by position) from line),
  array[
    'guest:gil',
    'user:00000000-0000-0000-0000-000000000903',
    'user:00000000-0000-0000-0000-000000000902',
    'user:00000000-0000-0000-0000-000000000901'
  ],
  'never drawn first, then least recently drawn, a returned draw still counting'
);
select is(
  (select array_agg(never_drawn order by position) from line),
  array[true, true, false, false],
  'each place says whether that person has ever been drawn'
);
select is(
  (select array_agg(bucket_key order by bucket_key) from narrowed),
  array['user:00000000-0000-0000-0000-000000000901', 'user:00000000-0000-0000-0000-000000000902'],
  'only people with a title among the candidates are in line'
);
select is(
  (select count(*)::int from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000901'),
  3,
  'reading the queue records nothing; only the draw that followed did'
);

-- It agrees with the draw

select ok(
  (select turn_bucket_key from drawn) in (select bucket_key from line where never_drawn),
  'the draw spent a turn from the front of the line'
);
select is(
  (
    select array_agg(entry ->> 'bucket_key' order by position)
    from drawn, jsonb_array_elements(rotation_queue) with ordinality as queue(entry, position)
    where position > 2
  ),
  (select array_agg(bucket_key order by position) from line where position > 2),
  'behind the tie, the line is the draw''s own order'
);
select is(
  (
    select array_agg(entry ->> 'bucket_key' order by entry ->> 'bucket_key')
    from drawn, jsonb_array_elements(rotation_queue) with ordinality as queue(entry, position)
    where position <= 2
  ),
  (select array_agg(bucket_key order by bucket_key) from line where position <= 2),
  'and the tie holds the same people'
);

-- After the draw, the person just drawn goes to the back.

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select is(
  (
    select bucket_key
    from public.get_bowl_rotation_queue(
      '10000000-0000-0000-0000-000000000901',
      array[
        '20000000-0000-0000-0000-000000000901',
        '20000000-0000-0000-0000-000000000902',
        '20000000-0000-0000-0000-000000000903',
        '20000000-0000-0000-0000-000000000904',
        '20000000-0000-0000-0000-000000000905',
        '20000000-0000-0000-0000-000000000906'
      ]::uuid[]
    )
    offset 3
  ),
  (select turn_bucket_key from drawn),
  'the owner reads the line too, with whoever was just drawn now last'
);

-- Nobody to line up

select is_empty(
  $$ select * from public.get_bowl_rotation_queue(
       '10000000-0000-0000-0000-000000000902',
       array['20000000-0000-0000-0000-000000000911']::uuid[]) $$,
  'a pack-only pool has no line'
);
select is_empty(
  $$ select * from public.get_bowl_rotation_queue(
       '10000000-0000-0000-0000-000000000903',
       array['20000000-0000-0000-0000-000000000931']::uuid[]) $$,
  'a bowl that is not on rotation has no line'
);
select is_empty(
  $$ select * from public.get_bowl_rotation_queue(
       '10000000-0000-0000-0000-000000000901',
       array[]::uuid[]) $$,
  'no candidates, no line'
);
select throws_ok(
  $$ select * from public.get_bowl_rotation_queue(
       '10000000-0000-0000-0000-000000000901',
       (select array_agg(gen_random_uuid()) from generate_series(1, 501))) $$,
  'P0001',
  'Too many candidate movies were supplied.',
  'the candidate list is bounded like the draw''s'
);
reset role;

select * from finish();
rollback;

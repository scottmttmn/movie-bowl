begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(26);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000041', 'rotation-owner@example.com'),
  ('00000000-0000-0000-0000-000000000042', 'rotation-member@example.com'),
  ('00000000-0000-0000-0000-000000000043', 'rotation-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000043'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  (
    '10000000-0000-0000-0000-000000000041',
    'Rotation Cycle',
    '00000000-0000-0000-0000-000000000041',
    'person_first'
  ),
  (
    '10000000-0000-0000-0000-000000000042',
    'Rotation History',
    '00000000-0000-0000-0000-000000000041',
    'rotation'
  ),
  (
    '10000000-0000-0000-0000-000000000043',
    'Rotation Never Drawn',
    '00000000-0000-0000-0000-000000000041',
    'rotation'
  ),
  (
    '10000000-0000-0000-0000-000000000044',
    'Rotation Named Guest',
    '00000000-0000-0000-0000-000000000041',
    'rotation'
  ),
  (
    '10000000-0000-0000-0000-000000000045',
    'Rotation Link Guest',
    '00000000-0000-0000-0000-000000000041',
    'rotation'
  ),
  (
    '10000000-0000-0000-0000-000000000046',
    'Title First Only',
    '00000000-0000-0000-0000-000000000041',
    'title_first'
  );

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (
  values
    ('00000000-0000-0000-0000-000000000041'::uuid, 'Owner'::text),
    ('00000000-0000-0000-0000-000000000042'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id between
  '10000000-0000-0000-0000-000000000041'::uuid and
  '10000000-0000-0000-0000-000000000046'::uuid;

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041', null, 4101, 'Cycle Owner'),
  ('20000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000042', null, 4102, 'Cycle Member'),
  ('20000000-0000-0000-0000-000000000043', '10000000-0000-0000-0000-000000000041', null, 'Cycle Guest', 4103, 'Cycle Guest'),
  ('20000000-0000-0000-0000-000000000044', '10000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000041', null, 4201, 'History Owner'),
  ('20000000-0000-0000-0000-000000000045', '10000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000042', null, 4202, 'History Member'),
  ('20000000-0000-0000-0000-000000000046', '10000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000041', null, 4301, 'Seen Owner'),
  ('20000000-0000-0000-0000-000000000047', '10000000-0000-0000-0000-000000000043', '00000000-0000-0000-0000-000000000042', null, 4302, 'New Member'),
  ('20000000-0000-0000-0000-000000000048', '10000000-0000-0000-0000-000000000044', null, 'sam', 4401, 'Named Guest'),
  ('20000000-0000-0000-0000-000000000049', '10000000-0000-0000-0000-000000000044', '00000000-0000-0000-0000-000000000041', null, 4402, 'Named Guest Owner'),
  ('20000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000045', null, null, 4501, 'Unnamed Guest'),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000045', '00000000-0000-0000-0000-000000000041', null, 4502, 'Unnamed Guest Owner'),
  ('20000000-0000-0000-0000-000000000052', '10000000-0000-0000-0000-000000000046', '00000000-0000-0000-0000-000000000041', null, 4601, 'Title First Movie'),
  ('20000000-0000-0000-0000-000000000053', '10000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000041', null, 4104, 'Cycle Owner Second Pick');

insert into public.bowl_draw_events (
  bowl_id,
  bowl_name,
  added_by,
  added_by_name,
  drawn_by,
  tmdb_id,
  title,
  drawn_at,
  returned_at
)
values
  ('10000000-0000-0000-0000-000000000042', 'Rotation History', '00000000-0000-0000-0000-000000000041', null, '00000000-0000-0000-0000-000000000041', 9201, 'Old Owner Draw', '2026-01-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000042', 'Rotation History', '00000000-0000-0000-0000-000000000042', null, '00000000-0000-0000-0000-000000000041', 9202, 'Returned Member Draw', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000043', 'Rotation Never Drawn', '00000000-0000-0000-0000-000000000041', null, '00000000-0000-0000-0000-000000000041', 9301, 'Prior Owner Draw', '2026-01-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000044', 'Rotation Named Guest', null, 'SAM', '00000000-0000-0000-0000-000000000041', 9401, 'Prior Guest Draw', '2026-02-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000044', 'Rotation Named Guest', '00000000-0000-0000-0000-000000000041', null, '00000000-0000-0000-0000-000000000041', 9402, 'Prior Guest Owner Draw', '2026-01-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000045', 'Rotation Link Guest', null, null, '00000000-0000-0000-0000-000000000041', 9501, 'Prior Unnamed Draw', '2026-02-01T00:00:00Z', null),
  ('10000000-0000-0000-0000-000000000045', 'Rotation Link Guest', '00000000-0000-0000-0000-000000000041', null, '00000000-0000-0000-0000-000000000041', 9502, 'Prior Unnamed Owner Draw', '2026-01-01T00:00:00Z', null);

select ok(
  has_function_privilege(
    'authenticated',
    'public.draw_bowl_movie_by_rotation(uuid,uuid[])',
    'EXECUTE'
  ),
  'authenticated users can call the rotation draw function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.draw_bowl_movie_by_rotation(uuid,uuid[])',
    'EXECUTE'
  ),
  'anonymous users cannot call the rotation draw function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public._record_bowl_movie_draw(uuid)',
    'EXECUTE'
  ),
  'authenticated users cannot call the private persistence helper'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.draw_bowl_movie_by_rotation(uuid,uuid[])'::regprocedure
  ),
  true,
  'the rotation draw function is security definer'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.draw_bowl_movie_by_rotation(uuid,uuid[])'::regprocedure
  ),
  array['search_path=public']::text[],
  'the rotation draw function fixes its search path'
);

select is(
  (select draw_method from public.bowls where id = '10000000-0000-0000-0000-000000000041'),
  'person_first',
  'existing bowls still default to person-first'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000042","email":"rotation-member@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000041',
      'rotation'
    )
  $sql$,
  '42501',
  'Only the bowl owner can update the draw method.',
  'a member cannot enable rotation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000043","email":"rotation-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000042',
      array['20000000-0000-0000-0000-000000000044']::uuid[]
    )
  $sql$,
  '42501',
  'You do not have permission to draw in this bowl.',
  'an outsider cannot draw by rotation'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","email":"rotation-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.save_bowl_draw_method(
    '10000000-0000-0000-0000-000000000041',
    'rotation'
  ),
  'rotation',
  'the owner can enable rotation'
);

select is(
  (select draw_method from public.bowls where id = '10000000-0000-0000-0000-000000000041'),
  'rotation',
  'rotation is stored on the bowl'
);

select throws_ok(
  $sql$
    select public.save_bowl_draw_method(
      '10000000-0000-0000-0000-000000000041',
      'raffle'
    )
  $sql$,
  'P0001',
  'Invalid draw method.',
  'unknown methods remain rejected'
);

reset role;

select throws_ok(
  $sql$
    update public.bowls
    set draw_method = 'raffle'
    where id = '10000000-0000-0000-0000-000000000041'
  $sql$,
  '23514',
  null,
  'the check constraint rejects unknown methods'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","email":"rotation-owner@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000041',
      '{}'::uuid[]
    )
  $sql$,
  'P0001',
  'No eligible movies are available for this rotation draw.',
  'an empty candidate pool is rejected'
);

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000041',
      array(select gen_random_uuid() from generate_series(1, 501))
    )
  $sql$,
  'P0001',
  'Too many candidate movies were supplied.',
  'an oversized candidate pool is rejected'
);

select throws_ok(
  $sql$
    select public.draw_bowl_movie(
      '20000000-0000-0000-0000-000000000041'
    )
  $sql$,
  'P0001',
  'This bowl now uses rotation. Refresh Movie Bowl and try again.',
  'the ordinary draw RPC refuses a rotation bowl'
);

create temporary table rotation_cycle_results (
  sequence integer generated always as identity,
  bowl_movie_id uuid not null
) on commit drop;

insert into rotation_cycle_results (bowl_movie_id)
select bowl_movie_id
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000041',
  array[
    '20000000-0000-0000-0000-000000000041',
    '20000000-0000-0000-0000-000000000042',
    '20000000-0000-0000-0000-000000000043',
    '20000000-0000-0000-0000-000000000053'
  ]::uuid[]
);

insert into rotation_cycle_results (bowl_movie_id)
select bowl_movie_id
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000041',
  array[
    '20000000-0000-0000-0000-000000000041',
    '20000000-0000-0000-0000-000000000042',
    '20000000-0000-0000-0000-000000000043',
    '20000000-0000-0000-0000-000000000053'
  ]::uuid[]
);

insert into rotation_cycle_results (bowl_movie_id)
select bowl_movie_id
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000041',
  array[
    '20000000-0000-0000-0000-000000000041',
    '20000000-0000-0000-0000-000000000042',
    '20000000-0000-0000-0000-000000000043',
    '20000000-0000-0000-0000-000000000053'
  ]::uuid[]
);

select is(
  (
    select count(distinct case
      when movie.added_by is not null then 'user:' || movie.added_by::text
      else 'guest:' || lower(movie.added_by_name)
    end)
    from rotation_cycle_results result
    join public.bowl_movies movie on movie.id = result.bowl_movie_id
    where result.sequence <= 3
  ),
  3::bigint,
  'every never-drawn contributor is selected before anyone repeats'
);

insert into rotation_cycle_results (bowl_movie_id)
select bowl_movie_id
from public.draw_bowl_movie_by_rotation(
  '10000000-0000-0000-0000-000000000041',
  array[
    '20000000-0000-0000-0000-000000000041',
    '20000000-0000-0000-0000-000000000042',
    '20000000-0000-0000-0000-000000000043',
    '20000000-0000-0000-0000-000000000053'
  ]::uuid[]
);

select is(
  (
    select count(*)
    from public.bowl_draw_events
    where bowl_id = '10000000-0000-0000-0000-000000000041'
  ),
  4::bigint,
  'rotation writes one durable bowl event per draw'
);

select is(
  (
    select count(*)
    from public.user_watch_events event
    join public.bowl_draw_events draw on draw.id = event.source_draw_event_id
    where draw.bowl_id = '10000000-0000-0000-0000-000000000041'
  ),
  8::bigint,
  'rotation preserves one watch event per bowl participant'
);

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000041',
      array[
        '20000000-0000-0000-0000-000000000041',
        '20000000-0000-0000-0000-000000000042',
        '20000000-0000-0000-0000-000000000043',
        '20000000-0000-0000-0000-000000000053',
        '20000000-0000-0000-0000-000000000044'
      ]::uuid[]
    )
  $sql$,
  'P0001',
  'The eligible rotation pool is stale. Please try again.',
  'drawn and wrong-bowl candidates produce a retryable stale-pool error'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000042","email":"rotation-member@example.com","role":"authenticated"}',
  true
);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000042',
      array[
        '20000000-0000-0000-0000-000000000044',
        '20000000-0000-0000-0000-000000000045'
      ]::uuid[]
    )
  ),
  '20000000-0000-0000-0000-000000000044'::uuid,
  'the oldest contributor wins and returned events still count'
);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000042',
      array['20000000-0000-0000-0000-000000000045']::uuid[]
    )
  ),
  '20000000-0000-0000-0000-000000000045'::uuid,
  'a filtered-out older contributor does not block the eligible contributor'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000041","email":"rotation-owner@example.com","role":"authenticated"}',
  true
);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000043',
      array[
        '20000000-0000-0000-0000-000000000046',
        '20000000-0000-0000-0000-000000000047'
      ]::uuid[]
    )
  ),
  '20000000-0000-0000-0000-000000000047'::uuid,
  'a contributor with no draw history goes first'
);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000044',
      array[
        '20000000-0000-0000-0000-000000000048',
        '20000000-0000-0000-0000-000000000049'
      ]::uuid[]
    )
  ),
  '20000000-0000-0000-0000-000000000049'::uuid,
  'named guest history is matched case-insensitively'
);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000045',
      array[
        '20000000-0000-0000-0000-000000000050',
        '20000000-0000-0000-0000-000000000051'
      ]::uuid[]
    )
  ),
  '20000000-0000-0000-0000-000000000051'::uuid,
  'unnamed add-link rows share the Link Guest history bucket'
);

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000046',
      array['20000000-0000-0000-0000-000000000052']::uuid[]
    )
  $sql$,
  'P0001',
  'This bowl is not using rotation.',
  'the rotation RPC refuses a non-rotation bowl'
);

select is(
  public.save_bowl_draw_method(
    '10000000-0000-0000-0000-000000000041',
    'person_first'
  ),
  'person_first',
  'the owner can switch back from rotation'
);

reset role;

select * from finish();
rollback;

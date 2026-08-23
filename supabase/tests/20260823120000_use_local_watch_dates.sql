begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000071', 'timezone-owner@example.com'),
  ('00000000-0000-0000-0000-000000000072', 'timezone-member@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000072'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  (
    '10000000-0000-0000-0000-000000000071',
    'Timezone Bowl',
    '00000000-0000-0000-0000-000000000071',
    'person_first'
  ),
  (
    '10000000-0000-0000-0000-000000000072',
    'Timezone Rotation Bowl',
    '00000000-0000-0000-0000-000000000071',
    'rotation'
  );

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000072',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000072',
    '00000000-0000-0000-0000-000000000072',
    'Member'
  );

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values
  (
    '20000000-0000-0000-0000-000000000071',
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000071',
    7101,
    'Kiritimati Draw'
  ),
  (
    '20000000-0000-0000-0000-000000000072',
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000071',
    7102,
    'Legacy UTC Draw'
  ),
  (
    '20000000-0000-0000-0000-000000000073',
    '10000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000071',
    7103,
    'Invalid Timezone Draw'
  ),
  (
    '20000000-0000-0000-0000-000000000074',
    '10000000-0000-0000-0000-000000000072',
    '00000000-0000-0000-0000-000000000072',
    7201,
    'Pago Pago Rotation Draw'
  );

select ok(
  to_regprocedure('public.draw_bowl_movie(uuid,text)') is not null,
  'the ordinary timezone-aware draw overload exists'
);

select ok(
  to_regprocedure('public.draw_bowl_movie_by_rotation(uuid,uuid[],text)') is not null,
  'the rotation timezone-aware draw overload exists'
);

select ok(
  to_regprocedure('public.draw_bowl_movie(uuid)') is not null,
  'the legacy ordinary draw RPC remains available'
);

select ok(
  to_regprocedure('public.draw_bowl_movie_by_rotation(uuid,uuid[])') is not null,
  'the legacy rotation draw RPC remains available'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.draw_bowl_movie(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can call timezone-aware ordinary draws'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.draw_bowl_movie(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot call timezone-aware ordinary draws'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public._record_bowl_movie_draw(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users cannot call the timezone persistence helper directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000071","email":"timezone-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);

select lives_ok(
  $sql$
    select *
    from public.draw_bowl_movie(
      '20000000-0000-0000-0000-000000000071',
      'Pacific/Kiritimati'
    )
  $sql$,
  'an ordinary draw accepts an IANA timezone'
);

reset role;

select is(
  (
    select history.watched_on
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000071'
      and history.user_id = '00000000-0000-0000-0000-000000000071'
  ),
  (
    select (event.drawn_at at time zone 'Pacific/Kiritimati')::date
    from public.bowl_draw_events event
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000071'
  ),
  'ordinary draw history uses the supplied local calendar date'
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000071'
  ),
  2,
  'every participant receives the same device-local watch date snapshot'
);

set local role authenticated;

select lives_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000072',
      array['20000000-0000-0000-0000-000000000074']::uuid[],
      'Pacific/Pago_Pago'
    )
  $sql$,
  'a rotation draw accepts an IANA timezone'
);

reset role;

select is(
  (
    select history.watched_on
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000074'
      and history.user_id = '00000000-0000-0000-0000-000000000071'
  ),
  (
    select (event.drawn_at at time zone 'Pacific/Pago_Pago')::date
    from public.bowl_draw_events event
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000074'
  ),
  'rotation draw history uses the supplied local calendar date'
);

select ok(
  (
    select kiritimati.watched_on <> pago_pago.watched_on
    from public.user_watch_events kiritimati
    join public.bowl_draw_events kiritimati_event
      on kiritimati_event.id = kiritimati.source_draw_event_id
    cross join public.user_watch_events pago_pago
    join public.bowl_draw_events pago_pago_event
      on pago_pago_event.id = pago_pago.source_draw_event_id
    where kiritimati_event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000071'
      and pago_pago_event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000074'
      and kiritimati.user_id = '00000000-0000-0000-0000-000000000071'
      and pago_pago.user_id = '00000000-0000-0000-0000-000000000071'
  ),
  'timezones on opposite sides of the date line produce different dates at the same instant'
);

set local role authenticated;

select throws_ok(
  $sql$
    select *
    from public.draw_bowl_movie(
      '20000000-0000-0000-0000-000000000073',
      'Not/A_Timezone'
    )
  $sql$,
  '22023',
  'The watched timezone is not recognized.',
  'an invalid timezone is rejected'
);

reset role;

select is(
  (
    select drawn_at
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000073'
  ),
  null::timestamptz,
  'rejecting a timezone does not consume the movie'
);

set local role authenticated;

select lives_ok(
  $sql$
    select *
    from public.draw_bowl_movie('20000000-0000-0000-0000-000000000072')
  $sql$,
  'older clients can still use the legacy ordinary draw RPC'
);

reset role;

select is(
  (
    select history.watched_on
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000072'
      and history.user_id = '00000000-0000-0000-0000-000000000071'
  ),
  (
    select (event.drawn_at at time zone 'UTC')::date
    from public.bowl_draw_events event
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000072'
  ),
  'the legacy RPC preserves its UTC fallback'
);

select * from finish();
rollback;

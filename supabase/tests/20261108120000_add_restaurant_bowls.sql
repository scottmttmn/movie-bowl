begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000811', 'restaurant-owner@example.com'),
  ('00000000-0000-0000-0000-000000000812', 'restaurant-member@example.com'),
  ('00000000-0000-0000-0000-000000000813', 'restaurant-outsider@example.com');

insert into public.profiles (id, email)
select id, email from auth.users where email like 'restaurant-%@example.com';

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

-- Creating

select ok(
  has_function_privilege('authenticated', 'public.create_owned_bowl(uuid, text, text)', 'execute'),
  'signed-in callers can create a bowl of a kind'
);
select ok(
  not has_function_privilege('anon', 'public.create_owned_bowl(uuid, text, text)', 'execute'),
  'anonymous callers cannot create a bowl of a kind'
);
select ok(
  not has_function_privilege('authenticated', 'public._match_bowl_movie_to_bowl_kind()', 'execute')
    and not has_function_privilege('authenticated', 'public._keep_bowl_kind()', 'execute'),
  'the kind triggers cannot be called directly'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000811');
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000811', 'Date Night Eats', 'restaurants')).kind,
  'restaurants',
  'the owner can create a restaurant bowl'
);
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000812', 'Friday Films')).kind,
  'movies',
  'the two-argument form still creates a movie bowl'
);
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000813', 'Also films', null)).kind,
  'movies',
  'no kind means a movie bowl'
);
select throws_ok(
  $$ select public.create_owned_bowl('10000000-0000-0000-0000-000000000814', 'Board games', 'games') $$,
  '22023',
  'Unknown bowl kind.',
  'an unknown kind is refused'
);
select is(
  (public.create_owned_bowl('10000000-0000-0000-0000-000000000811', 'Date Night Eats', 'movies')).kind,
  'restaurants',
  'replaying a creation returns the existing bowl, kind unchanged'
);
reset role;

select is(
  (select count(*)::integer from public.bowls where id = '10000000-0000-0000-0000-000000000814'),
  0,
  'a refused kind creates nothing'
);
select throws_ok(
  $$ insert into public.bowls (id, owner_id, name, kind)
     values ('10000000-0000-0000-0000-000000000815', '00000000-0000-0000-0000-000000000811', 'Odd', 'games') $$,
  '23514',
  null,
  'the table itself only holds the two kinds'
);

-- A bowl's kind is fixed

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000811');
select throws_ok(
  $$ update public.bowls set kind = 'movies' where id = '10000000-0000-0000-0000-000000000811' $$,
  '22023',
  'A bowl''s kind cannot change.',
  'the owner cannot turn a restaurant bowl into a movie bowl'
);
select lives_ok(
  $$ update public.bowls set name = 'Dinner Draw' where id = '10000000-0000-0000-0000-000000000811' $$,
  'the owner can still rename it'
);
reset role;

insert into public.bowl_members (bowl_id, user_id, role)
values ('10000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000812', 'Member');

-- Slips match their bowl

select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title)
     values ('10000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000811', 603, 'The Matrix') $$,
  '22023',
  'Restaurant bowls hold restaurants, not movies.',
  'a TMDB title cannot land in a restaurant bowl'
);
select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title, cuisine)
     values ('10000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000811', -5, 'La Rana', 'Mediterranean') $$,
  '22023',
  'Movie bowls hold movies, not restaurants.',
  'a restaurant cannot land in a movie bowl'
);
select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title, place_id)
     values ('10000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000811', -6, 'Somewhere', 'ChIJabc') $$,
  '22023',
  'Movie bowls hold movies, not restaurants.',
  'a place id cannot land in a movie bowl'
);
select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title, cuisine)
     values ('10000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000811', -7, 'Blank', '') $$,
  '23514',
  null,
  'a cuisine cannot be empty'
);

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000812');
select lives_ok(
  $$ insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title, cuisine, place_id, note)
     values ('20000000-0000-0000-0000-000000000811', '10000000-0000-0000-0000-000000000811',
             '00000000-0000-0000-0000-000000000812', -811, 'La Rana Bistro', 'Mediterranean', 'ChIJlarana', 'Anniversary spot') $$,
  'a member adds a restaurant to a restaurant bowl'
);
reset role;
-- Clients have no update grant on slips; this holds for the server's own writes.
select throws_ok(
  $$ update public.bowl_movies set tmdb_id = 603 where id = '20000000-0000-0000-0000-000000000811' $$,
  '22023',
  'Restaurant bowls hold restaurants, not movies.',
  'a restaurant slip cannot be turned into a TMDB title'
);

-- The account's bowl list names each bowl's kind, members included

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000812');
select is(
  (select c->>'kind' from jsonb_array_elements(public.get_my_bowl_context()->'bowls') c
   where c->>'id' = '10000000-0000-0000-0000-000000000811'),
  'restaurants',
  'a member sees the restaurant bowl and its kind, whatever their own setting'
);
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000811');
select is(
  (select c->>'kind' from jsonb_array_elements(public.get_my_bowl_context()->'bowls') c
   where c->>'id' = '10000000-0000-0000-0000-000000000812'),
  'movies',
  'a movie bowl reads as movies'
);
reset role;

-- Drawing

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000811');
select lives_ok(
  $$ select public.draw_bowl_movie('20000000-0000-0000-0000-000000000811', 'UTC') $$,
  'the owner draws the restaurant'
);
reset role;

select is(
  (select row(cuisine, place_id, note, title)::text from public.bowl_draw_events
   where source_bowl_movie_id = '20000000-0000-0000-0000-000000000811'),
  row('Mediterranean', 'ChIJlarana', 'Anniversary spot', 'La Rana Bistro')::text,
  'the draw event carries the restaurant'
);
select is(
  (select count(*)::integer from public.user_watch_events e
   join public.bowl_draw_events d on d.id = e.source_draw_event_id
   where d.source_bowl_movie_id = '20000000-0000-0000-0000-000000000811'),
  0,
  'a restaurant draw writes no personal watch history'
);

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values ('20000000-0000-0000-0000-000000000812', '10000000-0000-0000-0000-000000000812',
        '00000000-0000-0000-0000-000000000811', 812, 'Heat');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000811');
select lives_ok(
  $$ select public.draw_bowl_movie('20000000-0000-0000-0000-000000000812', 'UTC') $$,
  'a movie bowl still draws'
);
reset role;
select is(
  (select count(*)::integer from public.user_watch_events e
   join public.bowl_draw_events d on d.id = e.source_draw_event_id
   where d.source_bowl_movie_id = '20000000-0000-0000-0000-000000000812'),
  1,
  'a movie draw still writes personal watch history'
);
select is(
  (select row(cuisine, place_id)::text from public.bowl_draw_events
   where source_bowl_movie_id = '20000000-0000-0000-0000-000000000812'),
  row(null::text, null::text)::text,
  'a movie draw carries no restaurant fields'
);

-- Returning

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000812');
select lives_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000811')) $$,
  'a member returns the drawn restaurant inside the undo window'
);
reset role;
select is(
  (select row(cuisine, place_id, note)::text from public.bowl_movies
   where bowl_id = '10000000-0000-0000-0000-000000000811' and drawn_at is null and title = 'La Rana Bistro'),
  row('Mediterranean', 'ChIJlarana', 'Anniversary spot')::text,
  'the returned slip keeps its cuisine and place'
);

-- The setting

select is(
  (select restaurant_bowls_enabled from public.profiles where id = '00000000-0000-0000-0000-000000000813'),
  false,
  'restaurant bowls start off for every account'
);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000813');
select is(
  public.get_my_bowl_context()->'restaurant_bowls_enabled',
  'false'::jsonb,
  'the account context says when restaurant bowls are off'
);
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000813');
update public.profiles set restaurant_bowls_enabled = true where id = '00000000-0000-0000-0000-000000000813';
update public.profiles set restaurant_bowls_enabled = true where id = '00000000-0000-0000-0000-000000000811';
reset role;
select is(
  (select restaurant_bowls_enabled from public.profiles where id = '00000000-0000-0000-0000-000000000813'),
  true,
  'an account can turn restaurant bowls on for itself'
);
select is(
  (select restaurant_bowls_enabled from public.profiles where id = '00000000-0000-0000-0000-000000000811'),
  false,
  'an account cannot turn them on for someone else'
);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000813');
select is(
  public.get_my_bowl_context()->'restaurant_bowls_enabled',
  'true'::jsonb,
  'the account context says when restaurant bowls are on'
);
reset role;

select * from finish();
rollback;

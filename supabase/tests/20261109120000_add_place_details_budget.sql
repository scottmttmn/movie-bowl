begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(12);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000911', 'details-owner@example.com'),
  ('00000000-0000-0000-0000-000000000912', 'details-member@example.com'),
  ('00000000-0000-0000-0000-000000000913', 'details-outsider@example.com');

insert into public.profiles (id, email)
select id, email from auth.users where email like 'details-%@example.com';

insert into public.bowls (id, name, owner_id, kind)
values
  ('10000000-0000-0000-0000-000000000911', 'Eats', '00000000-0000-0000-0000-000000000911', 'restaurants'),
  ('10000000-0000-0000-0000-000000000912', 'Films', '00000000-0000-0000-0000-000000000911', 'movies');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000911', 'Owner'),
  ('10000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000912', 'Member');

insert into public.bowl_movies (bowl_id, tmdb_id, title, added_by, cuisine, place_id)
values ('10000000-0000-0000-0000-000000000911', -911, 'La Rana', '00000000-0000-0000-0000-000000000911', 'Mediterranean', 'ChIJlarana');

select ok(
  not has_function_privilege('authenticated', 'public.begin_place_details_fetch(uuid, uuid, text, text, integer)', 'execute')
    and not has_function_privilege('anon', 'public.begin_place_details_fetch(uuid, uuid, text, text, integer)', 'execute'),
  'only the server can reserve a Google request'
);
select ok(
  has_function_privilege('service_role', 'public.begin_place_details_fetch(uuid, uuid, text, text, integer)', 'execute'),
  'the server can'
);
select ok(
  not has_table_privilege('service_role', 'public.place_details_usage', 'SELECT')
    and not has_table_privilege('authenticated', 'public.place_details_usage', 'SELECT'),
  'the counter is sealed'
);

select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'details', 2),
  'ok', 'the owner can look up a place in the bowl'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000912', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'details', 2),
  'ok', 'so can a member'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000912', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'details', 2),
  'over_budget', 'and the month stops at its budget'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000912', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'photo', 2),
  'ok', 'a photo counts against its own budget'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000913', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'photo', 2),
  'denied', 'an outsider is refused before anything is counted'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000911', 'ChIJelsewhere', 'photo', 2),
  'denied', 'a place the bowl does not hold is refused'
);
select is(
  public.begin_place_details_fetch('00000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000912', 'ChIJlarana', 'photo', 2),
  'denied', 'a movie bowl has no places to look up'
);
select is(
  (select array_agg(request_count order by sku) from public.place_details_usage),
  array[2, 1],
  'refusals spend nothing'
);
select throws_ok(
  $$ select public.begin_place_details_fetch('00000000-0000-0000-0000-000000000911', '10000000-0000-0000-0000-000000000911', 'ChIJlarana', 'reviews', 2) $$,
  '22023', 'Unknown place details sku.', 'an unknown sku is refused'
);

select * from finish();
rollback;

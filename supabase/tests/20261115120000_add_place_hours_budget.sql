begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000921', 'hours-owner@example.com'),
  ('00000000-0000-0000-0000-000000000922', 'hours-member@example.com'),
  ('00000000-0000-0000-0000-000000000923', 'hours-outsider@example.com');

insert into public.profiles (id, email)
select id, email from auth.users where email like 'hours-%@example.com';

insert into public.bowls (id, name, owner_id, kind)
values
  ('10000000-0000-0000-0000-000000000921', 'Eats', '00000000-0000-0000-0000-000000000921', 'restaurants'),
  ('10000000-0000-0000-0000-000000000922', 'Films', '00000000-0000-0000-0000-000000000921', 'movies');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000921', 'Owner'),
  ('10000000-0000-0000-0000-000000000921', '00000000-0000-0000-0000-000000000922', 'Member');

insert into public.bowl_movies (bowl_id, tmdb_id, title, added_by, cuisine, place_id, drawn_at)
values
  ('10000000-0000-0000-0000-000000000921', -921, 'La Rana', '00000000-0000-0000-0000-000000000921', 'Mediterranean', 'ChIJa', null),
  ('10000000-0000-0000-0000-000000000921', -922, 'Mabe''s', '00000000-0000-0000-0000-000000000921', 'Pizza', 'ChIJb', null),
  ('10000000-0000-0000-0000-000000000921', -923, 'El Mezcal', '00000000-0000-0000-0000-000000000922', 'Mexican', 'ChIJc', null),
  ('10000000-0000-0000-0000-000000000921', -924, 'Taco truck', '00000000-0000-0000-0000-000000000922', 'Mexican', null, null),
  ('10000000-0000-0000-0000-000000000921', -925, 'Rubaiyat', '00000000-0000-0000-0000-000000000922', 'American', 'ChIJdrawn', now());

select ok(
  not has_function_privilege('authenticated', 'public.begin_place_hours_fetch(uuid, uuid, text[], integer)', 'execute')
    and not has_function_privilege('anon', 'public.begin_place_hours_fetch(uuid, uuid, text[], integer)', 'execute'),
  'only the server can reserve hours lookups'
);
select ok(
  has_function_privilege('service_role', 'public.begin_place_hours_fetch(uuid, uuid, text[], integer)', 'execute'),
  'the server can'
);

select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000923', '10000000-0000-0000-0000-000000000921', array['ChIJa'], 5),
  null, 'an outsider is refused'
);
select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000921', '10000000-0000-0000-0000-000000000922', array['ChIJa'], 5),
  null, 'a movie bowl has no hours to look up'
);
select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000921', '10000000-0000-0000-0000-000000000921', array['ChIJelsewhere', 'ChIJdrawn'], 5),
  '{}'::text[], 'a place the bowl does not hold undrawn is never asked about'
);
select is(
  (select count(*)::integer from public.place_details_usage where sku = 'hours'),
  0, 'and refusals spend nothing'
);
select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000922', '10000000-0000-0000-0000-000000000921', array['ChIJb', 'ChIJa', 'ChIJa', 'ChIJelsewhere'], 5),
  array['ChIJa', 'ChIJb'], 'a member is granted each place in the bowl once'
);
select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000921', '10000000-0000-0000-0000-000000000921', array['ChIJa', 'ChIJb', 'ChIJc'], 3),
  array['ChIJa'], 'a batch is cut to what the month has left'
);
select is(
  public.begin_place_hours_fetch('00000000-0000-0000-0000-000000000921', '10000000-0000-0000-0000-000000000921', array['ChIJc'], 3),
  '{}'::text[], 'and a spent month grants nothing'
);
select is(
  (select request_count from public.place_details_usage where sku = 'hours'),
  3, 'the count never passes the budget'
);

select * from finish();
rollback;

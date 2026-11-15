begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000931', 'window-owner@example.com'),
  ('00000000-0000-0000-0000-000000000932', 'window-member@example.com');

insert into public.profiles (id, email)
select id, email from auth.users where email like 'window-%@example.com';

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

insert into public.bowls (id, name, owner_id, kind)
values
  ('10000000-0000-0000-0000-000000000931', 'Eats', '00000000-0000-0000-0000-000000000931', 'restaurants'),
  ('10000000-0000-0000-0000-000000000932', 'Films', '00000000-0000-0000-0000-000000000931', 'movies');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000931', 'Owner'),
  ('10000000-0000-0000-0000-000000000931', '00000000-0000-0000-0000-000000000932', 'Member'),
  ('10000000-0000-0000-0000-000000000932', '00000000-0000-0000-0000-000000000931', 'Owner');

-- Slips already drawn, each with the draw event that took it out. The owner
-- drew every one; what differs is how long ago, and the kind of bowl.
insert into public.bowl_movies (id, bowl_id, tmdb_id, title, added_by, cuisine, drawn_at, drawn_by)
values
  ('20000000-0000-0000-0000-000000000931', '10000000-0000-0000-0000-000000000931', -931, 'La Rana', '00000000-0000-0000-0000-000000000931', 'Mediterranean', now(), '00000000-0000-0000-0000-000000000931'),
  ('20000000-0000-0000-0000-000000000932', '10000000-0000-0000-0000-000000000931', -932, 'Mabe''s', '00000000-0000-0000-0000-000000000931', 'Pizza', now(), '00000000-0000-0000-0000-000000000931'),
  ('20000000-0000-0000-0000-000000000933', '10000000-0000-0000-0000-000000000931', -933, 'El Mezcal', '00000000-0000-0000-0000-000000000931', 'Mexican', now() - interval '3 hours', '00000000-0000-0000-0000-000000000931'),
  ('20000000-0000-0000-0000-000000000934', '10000000-0000-0000-0000-000000000932', 934, 'Heat', '00000000-0000-0000-0000-000000000931', null, now(), '00000000-0000-0000-0000-000000000931'),
  ('20000000-0000-0000-0000-000000000935', '10000000-0000-0000-0000-000000000931', -935, 'Rubaiyat', '00000000-0000-0000-0000-000000000931', 'American', now() - interval '26 hours', '00000000-0000-0000-0000-000000000931'),
  ('20000000-0000-0000-0000-000000000936', '10000000-0000-0000-0000-000000000931', -936, 'Great Dragon', '00000000-0000-0000-0000-000000000931', 'Chinese', now() - interval '26 hours', '00000000-0000-0000-0000-000000000931');

insert into public.bowl_draw_events (bowl_id, source_bowl_movie_id, bowl_name, added_by, drawn_by, tmdb_id, title, cuisine, drawn_at, return_until)
select m.bowl_id, m.id, 'Bowl', m.added_by, m.drawn_by, m.tmdb_id, m.title, m.cuisine, m.drawn_at,
  case m.title
    when 'Rubaiyat' then now() + interval '1 hour'
    when 'Great Dragon' then now() - interval '1 hour'
  end
from public.bowl_movies m
where m.id::text like '20000000-0000-0000-0000-00000000093%';

select ok(
  has_function_privilege('authenticated', 'public.set_bowl_draw_return_window(uuid, timestamptz)', 'execute')
    and not has_function_privilege('anon', 'public.set_bowl_draw_return_window(uuid, timestamptz)', 'execute'),
  'only a signed-in person can plan a draw'
);

-- Setting the deadline

set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000932');
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000931', now() + interval '3 days'),
  null, 'someone who did not draw cannot set the deadline'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000000931');
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000931', now() + interval '3 days'),
  now() + interval '3 days', 'the person who drew keeps the draw returnable until the day'
);
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000931', now() + interval '6 days'),
  null, 'and cannot move the deadline afterwards'
);
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000932', now() + interval '30 days'),
  now() + interval '7 days', 'a deadline stops seven days from the draw'
);
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000933', now() + interval '3 days'),
  null, 'a draw past its two hours cannot be reopened'
);
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000934', now() + interval '3 days'),
  null, 'a movie draw keeps its two hours'
);
reset role;

select is(
  (select return_until from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000934'),
  null, 'and nothing was written to it'
);
update public.bowl_draw_events set return_until = null
where source_bowl_movie_id = '20000000-0000-0000-0000-000000000932';
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-000000000931');
select is(
  public.set_bowl_draw_return_window('20000000-0000-0000-0000-000000000932', now() + interval '1 hour'),
  null, 'a deadline inside the ordinary two hours changes nothing'
);

-- Returning

select pg_temp.act_as('00000000-0000-0000-0000-000000000932');
select lives_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000935')) $$,
  'a member returns a day-old draw before its deadline'
);
select throws_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000936')) $$,
  'P0001', 'This draw is too old to move back to the bowl. Add the movie again instead.',
  'and is refused once the deadline has passed'
);
select throws_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000933')) $$,
  'P0001', 'This draw is too old to move back to the bowl. Add the movie again instead.',
  'a draw with no deadline still closes after two hours'
);
select lives_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000932')) $$,
  'and still returns inside them'
);
reset role;

select is(
  (select count(*)::integer from public.bowl_movies
   where bowl_id = '10000000-0000-0000-0000-000000000931' and drawn_at is null and title in ('Rubaiyat', 'Mabe''s')),
  2, 'each return puts a slip back in the bowl'
);

select * from finish();
rollback;

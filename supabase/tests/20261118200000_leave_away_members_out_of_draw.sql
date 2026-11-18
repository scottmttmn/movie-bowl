begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000941', 'room-owner@example.com'),
  ('00000000-0000-0000-0000-000000000942', 'room-here@example.com'),
  ('00000000-0000-0000-0000-000000000943', 'room-away@example.com');

insert into public.profiles (id, email)
select id, email from auth.users where email like 'room-%@example.com';

create function pg_temp.act_as(p_user uuid) returns void
language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
$$;

insert into public.bowls (id, name, owner_id, kind)
values ('10000000-0000-0000-0000-000000000941', 'Friday Night', '00000000-0000-0000-0000-000000000941', 'movies');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000941', 'Owner'),
  ('10000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000942', 'Member'),
  ('10000000-0000-0000-0000-000000000941', '00000000-0000-0000-0000-000000000943', 'Member');

-- Three draws by the owner: one just now, one twenty minutes ago, and one
-- just now that has since been returned.
insert into public.bowl_movies (id, bowl_id, tmdb_id, title, added_by, drawn_at, drawn_by)
values
  ('20000000-0000-0000-0000-000000000941', '10000000-0000-0000-0000-000000000941', 941, 'Heat', '00000000-0000-0000-0000-000000000941', now(), '00000000-0000-0000-0000-000000000941'),
  ('20000000-0000-0000-0000-000000000942', '10000000-0000-0000-0000-000000000941', 942, 'Alien', '00000000-0000-0000-0000-000000000943', now() - interval '20 minutes', '00000000-0000-0000-0000-000000000941'),
  ('20000000-0000-0000-0000-000000000943', '10000000-0000-0000-0000-000000000941', 943, 'Arrival', '00000000-0000-0000-0000-000000000942', now(), '00000000-0000-0000-0000-000000000941');

insert into public.bowl_draw_events (id, bowl_id, source_bowl_movie_id, bowl_name, added_by, drawn_by, tmdb_id, title, drawn_at, returned_at)
select
  ('30000000-0000-0000-0000-00000000094' || right(m.id::text, 1))::uuid,
  m.bowl_id, m.id, 'Friday Night', m.added_by, m.drawn_by, m.tmdb_id, m.title, m.drawn_at,
  case when m.title = 'Arrival' then now() end
from public.bowl_movies m
where m.bowl_id = '10000000-0000-0000-0000-000000000941';

-- Every member got every draw, as the draw functions write it.
insert into public.user_watch_events (user_id, source_draw_event_id, source_kind, bowl_name, tmdb_id, title, watched_on)
select u.id, e.id, 'bowl_draw', 'Friday Night', e.tmdb_id, e.title, current_date
from public.bowl_draw_events e
cross join auth.users u
where e.bowl_id = '10000000-0000-0000-0000-000000000941'
  and u.email like 'room-%@example.com';

create function pg_temp.history(p_user uuid, p_title text) returns bigint
language sql as $$
  select count(*) from public.user_watch_events
  where user_id = p_user and title = p_title;
$$;

select ok(
  has_function_privilege('authenticated', 'public.leave_away_members_out_of_draw(uuid, uuid[])', 'execute')
    and not has_function_privilege('anon', 'public.leave_away_members_out_of_draw(uuid, uuid[])', 'execute'),
  'only a signed-in person can say who was away'
);

set local role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-000000000942');
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000941', array['00000000-0000-0000-0000-000000000943'::uuid]),
  0, 'someone who did not draw cannot take a draw out of anyone''s history'
);

select pg_temp.act_as('00000000-0000-0000-0000-000000000941');
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000941', '{}'),
  0, 'nobody away changes nothing'
);
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000941', array['00000000-0000-0000-0000-000000000943'::uuid]),
  1, 'the person who drew leaves the away member out'
);
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000941', array['00000000-0000-0000-0000-000000000941'::uuid]),
  0, 'whoever drew cannot leave themselves out'
);
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000942', array['00000000-0000-0000-0000-000000000943'::uuid]),
  0, 'but not once ten minutes have passed'
);
select is(
  public.leave_away_members_out_of_draw('20000000-0000-0000-0000-000000000943', array['00000000-0000-0000-0000-000000000943'::uuid]),
  0, 'nor from a draw that went back in the bowl'
);

reset role;

select is(pg_temp.history('00000000-0000-0000-0000-000000000943', 'Heat'), 0::bigint, 'the away member has no history of the draw');
select is(pg_temp.history('00000000-0000-0000-0000-000000000942', 'Heat'), 1::bigint, 'the member who was here keeps it');
select is(pg_temp.history('00000000-0000-0000-0000-000000000941', 'Heat'), 1::bigint, 'and so does the person who drew');
select is(pg_temp.history('00000000-0000-0000-0000-000000000943', 'Alien'), 1::bigint, 'other draws are untouched');

select * from finish();
rollback;

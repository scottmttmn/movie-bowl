begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

-- Scott owns Friday Night with Robin and Casey; Jo has left it; Pat was never
-- in it.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000001201', 'scott@example.com'),
  ('00000000-0000-0000-0000-000000001202', 'robin@example.com'),
  ('00000000-0000-0000-0000-000000001203', 'casey@example.com'),
  ('00000000-0000-0000-0000-000000001204', 'jo@example.com'),
  ('00000000-0000-0000-0000-000000001205', 'pat@example.com');

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-000000001201', 'scott@example.com', 'Scott'),
  ('00000000-0000-0000-0000-000000001202', 'robin@example.com', 'Robin'),
  ('00000000-0000-0000-0000-000000001203', 'casey@example.com', 'Casey'),
  ('00000000-0000-0000-0000-000000001204', 'jo@example.com', 'Jo'),
  ('00000000-0000-0000-0000-000000001205', 'pat@example.com', 'Pat');

insert into public.bowls (id, name, owner_id)
values ('00000000-0000-0000-0000-000000001290', 'Friday Night', '00000000-0000-0000-0000-000000001201');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000001290', '00000000-0000-0000-0000-000000001201', 'Owner'),
  ('00000000-0000-0000-0000-000000001290', '00000000-0000-0000-0000-000000001202', 'Member'),
  ('00000000-0000-0000-0000-000000001290', '00000000-0000-0000-0000-000000001203', 'Member');

-- Two draws: a TMDB movie and a custom title.
insert into public.bowl_draw_events (id, bowl_id, bowl_name, added_by, drawn_by, tmdb_id, title, drawn_at)
values
  ('00000000-0000-0000-0000-0000000012d1', '00000000-0000-0000-0000-000000001290', 'Friday Night', '00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-000000001201', 655, 'Paris, Texas', '2026-11-13 02:00+00'),
  ('00000000-0000-0000-0000-0000000012d2', '00000000-0000-0000-0000-000000001290', 'Friday Night', '00000000-0000-0000-0000-000000001203', '00000000-0000-0000-0000-000000001201', -7, 'Something with Adam Sandler', '2026-11-12 02:00+00');

insert into public.user_watch_events (id, user_id, source_draw_event_id, source_kind, bowl_name, tmdb_id, title, watched_on)
values
  ('00000000-0000-0000-0000-0000000012e1', '00000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-0000000012d1', 'bowl_draw', 'Friday Night', 655, 'Paris, Texas', '2026-11-12'),
  ('00000000-0000-0000-0000-0000000012e2', '00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-0000000012d1', 'bowl_draw', 'Friday Night', 655, 'Paris, Texas', '2026-11-12'),
  ('00000000-0000-0000-0000-0000000012e3', '00000000-0000-0000-0000-000000001203', '00000000-0000-0000-0000-0000000012d1', 'bowl_draw', 'Friday Night', 655, 'Paris, Texas', '2026-11-12'),
  ('00000000-0000-0000-0000-0000000012e4', '00000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-0000000012d2', 'bowl_draw', 'Friday Night', -7, 'Something with Adam Sandler', '2026-11-11'),
  ('00000000-0000-0000-0000-0000000012e5', '00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-0000000012d2', 'bowl_draw', 'Friday Night', -7, 'Something with Adam Sandler', '2026-11-11'),
  -- Scott watched Paris, Texas once before on his own.
  ('00000000-0000-0000-0000-0000000012e6', '00000000-0000-0000-0000-000000001201', null, 'manual', null, 655, 'Paris, Texas', '2025-03-01'),
  -- Jo saw it in the bowl before leaving; Pat saw it elsewhere.
  ('00000000-0000-0000-0000-0000000012e7', '00000000-0000-0000-0000-000000001204', '00000000-0000-0000-0000-0000000012d1', 'bowl_draw', 'Friday Night', 655, 'Paris, Texas', '2026-11-12'),
  ('00000000-0000-0000-0000-0000000012e8', '00000000-0000-0000-0000-000000001205', null, 'manual', null, 655, 'Paris, Texas', '2026-01-01');

-- Grants ------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_movie_ratings'::regclass),
  'ratings have RLS enabled'
);

select ok(
  has_table_privilege('authenticated', 'public.user_movie_ratings', 'SELECT')
    and not has_table_privilege('authenticated', 'public.user_movie_ratings', 'INSERT')
    and not has_table_privilege('authenticated', 'public.user_movie_ratings', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.user_movie_ratings', 'DELETE')
    and not has_table_privilege('anon', 'public.user_movie_ratings', 'SELECT'),
  'signed-in people read ratings but only write through the function; anonymous visitors do neither'
);

select ok(
  not has_function_privilege('anon', 'public.set_my_movie_rating(uuid, smallint)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_bowl_watched_ratings(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.drop_unwatched_movie_rating()', 'EXECUTE'),
  'anonymous visitors cannot rate or read a bowl''s thumbs'
);

select ok(
  has_function_privilege('authenticated', 'public.set_my_movie_rating(uuid, smallint)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_bowl_watched_ratings(uuid)', 'EXECUTE'),
  'signed-in people can rate and read'
);

-- Rating your own -----------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001202","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001202', true);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')),
  0,
  'nobody has rated anything yet'
);

select is(
  (public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e2', 2::smallint))->>'rating',
  '2',
  'Robin rates Paris, Texas two up'
);

select throws_ok(
  $$select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e1', 1::smallint)$$,
  'P0002',
  null,
  'nobody rates through someone else''s history entry'
);

select throws_ok(
  $$select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e2', 0::smallint)$$,
  '22023',
  null,
  'zero is not a rating'
);

select throws_ok(
  $$insert into public.user_movie_ratings (user_id, tmdb_id, rating) values ('00000000-0000-0000-0000-000000001201', 655, -2)$$,
  '42501',
  null,
  'no one writes the table directly, least of all someone else''s row'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001203","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001203', true);
select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e3', (-1)::smallint);

select is(
  (select count(*)::int from public.user_movie_ratings),
  1,
  'a person reads only their own ratings'
);

-- Rate to reveal ----------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001201","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where draw_event_id = '00000000-0000-0000-0000-0000000012d1'),
  2,
  'before rating, Scott learns that two bowl-mates rated'
);

select ok(
  (select bool_and(rating is null) from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')),
  'but not what they picked'
);

select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e1', 2::smallint);

select set_eq(
  $$select user_id::text, rating from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
    where draw_event_id = '00000000-0000-0000-0000-0000000012d1'$$,
  $$values ('00000000-0000-0000-0000-000000001201', 2::smallint),
           ('00000000-0000-0000-0000-000000001202', 2::smallint),
           ('00000000-0000-0000-0000-000000001203', (-1)::smallint)$$,
  'once Scott rates, every member''s thumb turns over'
);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where user_id = '00000000-0000-0000-0000-000000001204'),
  0,
  'someone who left the bowl drops out of its thumbs'
);

select is(
  (select is_self from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where user_id = '00000000-0000-0000-0000-000000001201'),
  true,
  'the caller''s own row is marked'
);

-- One rating per movie ---------------------------------------------------

select is(
  (public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e6', 1::smallint))->>'rating',
  '1',
  'rating the earlier viewing changes the same rating'
);

select is(
  (select array_agg(rating) from public.user_movie_ratings where tmdb_id = 655),
  array[1::smallint],
  'a movie watched twice still has one rating'
);

-- The shared link shows thumbs only with comments on ---------------------

select public.save_my_watch_history_share_link(false);

select ok(
  (select bool_and(entry->'rating' = 'null'::jsonb)
   from jsonb_array_elements(public.get_shared_watch_history((public.get_my_watch_history_share_link())->>'token')->'entries') entry),
  'with comments off, the shared link carries no thumbs'
);

select public.save_my_watch_history_share_link(true);

select is(
  (select array_agg((entry->>'rating')::int order by entry->>'watched_on')
   from jsonb_array_elements(public.get_shared_watch_history((public.get_my_watch_history_share_link())->>'token')->'entries') entry
   where entry->>'tmdb_id' = '655'),
  array[1, 1],
  'with comments on, both viewings show the one rating'
);

-- Custom titles ----------------------------------------------------------

select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e4', (-2)::smallint);

select is(
  (select watch_event_id::text from public.user_movie_ratings where tmdb_id is null),
  '00000000-0000-0000-0000-0000000012e4',
  'a custom title''s rating hangs on its history entry'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001202","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001202', true);

select ok(
  (select rating is null from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where draw_event_id = '00000000-0000-0000-0000-0000000012d2'
     and user_id = '00000000-0000-0000-0000-000000001201'),
  'a custom draw is face down too until Robin rates it'
);

select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e5', 1::smallint);

select is(
  (select rating from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where draw_event_id = '00000000-0000-0000-0000-0000000012d2'
     and user_id = '00000000-0000-0000-0000-000000001201'),
  (-2)::smallint,
  'and turns over once she does'
);

-- Clearing ---------------------------------------------------------------

select is(
  (public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e5', null))->>'rating',
  null,
  'a rating can be cleared'
);

select is(
  (select count(*)::int from public.user_movie_ratings where tmdb_id is null),
  0,
  'clearing removes the row rather than storing a zero'
);

-- Outsiders --------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001205","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001205', true);
select public.set_my_movie_rating('00000000-0000-0000-0000-0000000012e8', 2::smallint);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')),
  0,
  'someone outside the bowl reads none of its thumbs, even having rated the movie'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001204","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001204', true);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')),
  0,
  'nor does someone who left it'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001201","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);

select ok(
  not exists (
    select 1 from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
    where user_id = '00000000-0000-0000-0000-000000001205'
  ),
  'a rating given outside the bowl by a non-member never shows in it'
);

-- Returned and removed draws ----------------------------------------------

reset role;
update public.bowl_draw_events set removed_at = now()
where id = '00000000-0000-0000-0000-0000000012d2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001201","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001201', true);

select is(
  (select count(*)::int from public.get_bowl_watched_ratings('00000000-0000-0000-0000-000000001290')
   where draw_event_id = '00000000-0000-0000-0000-0000000012d2'),
  0,
  'a draw removed from the bowl''s history leaves its thumbs out too'
);

-- The last entry goes, and the rating with it -------------------------------

reset role;
delete from public.user_watch_events where id = '00000000-0000-0000-0000-0000000012e1';

select is(
  (select rating from public.user_movie_ratings
   where user_id = '00000000-0000-0000-0000-000000001201' and tmdb_id = 655),
  1::smallint,
  'deleting one viewing keeps the rating while another is left'
);

delete from public.user_watch_events where id = '00000000-0000-0000-0000-0000000012e6';

select is(
  (select count(*)::int from public.user_movie_ratings
   where user_id = '00000000-0000-0000-0000-000000001201' and tmdb_id = 655),
  0,
  'deleting the last viewing deletes the rating'
);

delete from public.user_watch_events where id = '00000000-0000-0000-0000-0000000012e4';

select is(
  (select count(*)::int from public.user_movie_ratings
   where user_id = '00000000-0000-0000-0000-000000001201'),
  0,
  'a custom title''s rating goes with its entry'
);

select * from finish();
rollback;

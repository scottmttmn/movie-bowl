begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(33);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000081', 'pin-owner@example.com'),
  ('00000000-0000-0000-0000-000000000082', 'pin-member@example.com'),
  ('00000000-0000-0000-0000-000000000083', 'pin-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000082',
  '00000000-0000-0000-0000-000000000083'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  (
    '10000000-0000-0000-0000-000000000081',
    'Pinned Person First',
    '00000000-0000-0000-0000-000000000081',
    'person_first'
  ),
  (
    '10000000-0000-0000-0000-000000000082',
    'Pinned Rotation',
    '00000000-0000-0000-0000-000000000081',
    'rotation'
  ),
  (
    '10000000-0000-0000-0000-000000000083',
    'Pinned Rotation History',
    '00000000-0000-0000-0000-000000000081',
    'rotation'
  );

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (
  values
    ('00000000-0000-0000-0000-000000000081'::uuid, 'Owner'::text),
    ('00000000-0000-0000-0000-000000000082'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id in (
  '10000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000082',
  '10000000-0000-0000-0000-000000000083'
);

insert into public.bowl_add_links (
  id,
  bowl_id,
  token,
  created_by,
  max_adds,
  adds_used,
  default_contributor_name
)
values (
  '30000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081',
  'pinned-link',
  '00000000-0000-0000-0000-000000000081',
  2,
  1,
  'Guest'
);

insert into public.bowl_movies (
  id,
  bowl_id,
  added_by,
  added_by_name,
  added_via_link_id,
  tmdb_id,
  title,
  drawn_at,
  drawn_by
)
values
  ('20000000-0000-0000-0000-000000000081', '10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000081', null, null, 8101, 'Owner First', null, null),
  ('20000000-0000-0000-0000-000000000082', '10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000081', null, null, 8102, 'Owner Second', null, null),
  ('20000000-0000-0000-0000-000000000083', '10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000082', null, null, 8103, 'Member Movie', null, null),
  ('20000000-0000-0000-0000-000000000084', '10000000-0000-0000-0000-000000000081', null, 'Guest', '30000000-0000-0000-0000-000000000081', 8104, 'Link Guest Movie', null, null),
  ('20000000-0000-0000-0000-000000000085', '10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000081', null, null, 8105, 'Drawn Movie', now(), '00000000-0000-0000-0000-000000000081'),
  ('20000000-0000-0000-0000-000000000086', '10000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000081', null, null, 8201, 'Rotation Pinned', null, null),
  ('20000000-0000-0000-0000-000000000087', '10000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000081', null, null, 8202, 'Rotation Other', null, null),
  ('20000000-0000-0000-0000-000000000088', '10000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000081', null, null, 8203, 'Rotation Third', null, null),
  ('20000000-0000-0000-0000-000000000089', '10000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000081', null, null, 8301, 'History Owner', null, null),
  ('20000000-0000-0000-0000-000000000090', '10000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000082', null, null, 8302, 'History Member Pinned', null, null);

insert into public.bowl_draw_events (
  bowl_id,
  bowl_name,
  added_by,
  drawn_by,
  tmdb_id,
  title,
  drawn_at
)
values
  ('10000000-0000-0000-0000-000000000083', 'Pinned Rotation History', '00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000081', 8391, 'Older Owner History', '2026-01-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000083', 'Pinned Rotation History', '00000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000081', 8392, 'Newer Member History', '2026-02-01T00:00:00Z');

select has_column('public', 'bowl_movies', 'is_pinned', 'bowl movies have a pin column');
select col_type_is('public', 'bowl_movies', 'is_pinned', 'boolean', 'bowl movie pins are boolean');
select ok(
  (
    select attribute.attnotnull
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.bowl_movies'::regclass
      and attribute.attname = 'is_pinned'
  ),
  'the pin column is not nullable'
);
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000081'),
  false,
  'existing and newly inserted slips default to unpinned'
);
select ok(
  to_regclass('public.bowl_movies_one_pin_per_contributor') is not null,
  'the one-pin partial unique index exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_own_bowl_movie_pin(uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated contributors can call the pin RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_own_bowl_movie_pin(uuid,boolean)',
    'EXECUTE'
  ),
  'anonymous users cannot execute the pin RPC'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.set_own_bowl_movie_pin(uuid,boolean)'::regprocedure
  ),
  true,
  'the pin RPC is security definer'
);
select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.set_own_bowl_movie_pin(uuid,boolean)'::regprocedure
  ),
  array['search_path=public']::text[],
  'the pin RPC fixes its search path'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","email":"pin-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000081', true)$$,
  'a contributor can pin an owned undrawn movie'
);
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000081'),
  true,
  'the selected owned movie is pinned'
);
select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000082', true)$$,
  'pinning a second owned movie atomically moves the pin'
);
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000081'),
  false,
  'moving the pin clears the prior movie'
);
select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000081'
      and added_by = '00000000-0000-0000-0000-000000000081'
      and is_pinned
  ),
  1::bigint,
  'a contributor has exactly one active pin after moving it'
);
select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000082', false)$$,
  'a contributor can unpin the selected movie'
);
select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000081'
      and added_by = '00000000-0000-0000-0000-000000000081'
      and is_pinned
  ),
  0::bigint,
  'unpinning leaves no contributor pin'
);
select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000084', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'an add-link guest movie cannot be pinned'
);
select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000085', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'a drawn movie cannot be pinned'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000082","email":"pin-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000082', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000083', true)$$,
  'a member can pin their own undrawn movie'
);
select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000081', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'another member cannot pin the contributor movie'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000083","email":"pin-outsider@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000083', true);

select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000083', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'an outsider cannot pin a bowl movie'
);

reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000081', true)$$,
  '42501',
  'You must be signed in to pin a movie.',
  'an anonymous caller cannot pin a movie'
);

update public.bowl_movies
set is_pinned = true
where id = '20000000-0000-0000-0000-000000000081';

select throws_ok(
  $$
    update public.bowl_movies
    set is_pinned = true
    where id = '20000000-0000-0000-0000-000000000082'
  $$,
  '23505',
  null,
  'the partial unique index rejects a second active contributor pin'
);

update public.bowl_movies
set is_pinned = false
where id in (
  '20000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000082'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","email":"pin-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000081', true)$$,
  'the owner can prepare a pin for an ordinary draw'
);
select lives_ok(
  $$select * from public.draw_bowl_movie('20000000-0000-0000-0000-000000000081', 'UTC')$$,
  'an ordinary draw records a pinned movie'
);

reset role;
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000081'),
  false,
  'an ordinary draw clears the movie pin'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","email":"pin-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000086', true)$$,
  'the owner can prepare a rotation pin'
);
select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000082',
      array['20000000-0000-0000-0000-000000000087']::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000087'::uuid,
  'a pinned movie outside the eligible ids is never selected'
);

reset role;
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000086'),
  true,
  'an excluded pin remains saved after another eligible title is drawn'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","email":"pin-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000082',
      array[
        '20000000-0000-0000-0000-000000000086',
        '20000000-0000-0000-0000-000000000088'
      ]::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000086'::uuid,
  'rotation prefers the pin inside the contributor selected bucket'
);

reset role;
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000086'),
  false,
  'a rotation draw clears the selected movie pin'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000082","email":"pin-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000082', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000090', true)$$,
  'a member can prepare a pin in a history-aware rotation bowl'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000081","email":"pin-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000081', true);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000083',
      array[
        '20000000-0000-0000-0000-000000000089',
        '20000000-0000-0000-0000-000000000090'
      ]::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000089'::uuid,
  'a pin does not move its contributor ahead in rotation history'
);

reset role;

select * from finish();
rollback;

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000501', 'pack-owner@example.com'),
  ('00000000-0000-0000-0000-000000000502', 'pack-member@example.com'),
  ('00000000-0000-0000-0000-000000000503', 'pack-second-member@example.com'),
  ('00000000-0000-0000-0000-000000000504', 'pack-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000502',
  '00000000-0000-0000-0000-000000000503',
  '00000000-0000-0000-0000-000000000504'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  ('10000000-0000-0000-0000-000000000501', 'Pack Person First', '00000000-0000-0000-0000-000000000501', 'person_first'),
  ('10000000-0000-0000-0000-000000000502', 'Pack Rotation', '00000000-0000-0000-0000-000000000501', 'rotation'),
  ('10000000-0000-0000-0000-000000000503', 'Pack Only Rotation', '00000000-0000-0000-0000-000000000501', 'rotation'),
  ('10000000-0000-0000-0000-000000000504', 'Pack Nearly Full', '00000000-0000-0000-0000-000000000501', 'person_first'),
  ('10000000-0000-0000-0000-000000000505', 'Pack Nothing New', '00000000-0000-0000-0000-000000000501', 'person_first'),
  ('10000000-0000-0000-0000-000000000506', 'Pack Title First', '00000000-0000-0000-0000-000000000501', 'title_first');

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (
  values
    ('00000000-0000-0000-0000-000000000501'::uuid, 'Owner'::text),
    ('00000000-0000-0000-0000-000000000502'::uuid, 'Member'::text),
    ('00000000-0000-0000-0000-000000000503'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id::text like '10000000-0000-0000-0000-0000000005%';

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000501', '10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', 50001, 'Owner Own'),
  ('20000000-0000-0000-0000-000000000502', '10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502', 50002, 'Member Own'),
  ('20000000-0000-0000-0000-000000000511', '10000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000501', 51001, 'Rotation Owner'),
  ('20000000-0000-0000-0000-000000000512', '10000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000502', 51002, 'Rotation Member'),
  ('20000000-0000-0000-0000-000000000521', '10000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000501', 52001, 'Filtered Owner'),
  ('20000000-0000-0000-0000-000000000522', '10000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000502', 52002, 'Filtered Member'),
  ('20000000-0000-0000-0000-000000000551', '10000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000501', 55001, 'Already Here'),
  ('20000000-0000-0000-0000-000000000561', '10000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000502', 56001, 'Title First Member');

-- 499 undrawn slips: one short of the bowl limit.
insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title)
select '10000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000501', 540000 + n, 'Filler ' || n
from generate_series(1, 499) n;

-- Pack slips seeded directly, for the draw cases, in the shape install writes.
insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000513', '10000000-0000-0000-0000-000000000502', null, 'Nolan: The ''00s', 'nolan-2000s', 51003, 'Rotation Pack One'),
  ('20000000-0000-0000-0000-000000000514', '10000000-0000-0000-0000-000000000502', null, 'Nolan: The ''00s', 'nolan-2000s', 51004, 'Rotation Pack Two'),
  ('20000000-0000-0000-0000-000000000523', '10000000-0000-0000-0000-000000000503', null, 'Nolan: The ''00s', 'nolan-2000s', 52003, 'The Only Pack Slip'),
  ('20000000-0000-0000-0000-000000000562', '10000000-0000-0000-0000-000000000506', null, 'Nolan: The ''00s', 'nolan-2000s', 56002, 'Title First Pack');

update public.bowls
set starter_pack = 'nolan-2000s', starter_pack_installed_at = now()
where id in (
  '10000000-0000-0000-0000-000000000502',
  '10000000-0000-0000-0000-000000000503',
  '10000000-0000-0000-0000-000000000506'
);

-- Rotation history: the member's own title was drawn first, and then a pack
-- slip on the owner's turn. Without the recorded turn the owner would look
-- never-drawn and go next.
insert into public.bowl_draw_events (bowl_id, bowl_name, added_by, added_by_name, starter_pack, turn_bucket_key, drawn_by, tmdb_id, title, drawn_at)
values
  ('10000000-0000-0000-0000-000000000502', 'Pack Rotation', '00000000-0000-0000-0000-000000000502', null, null, null, '00000000-0000-0000-0000-000000000501', 51901, 'Member History', '2026-01-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000502', 'Pack Rotation', null, 'Nolan: The ''00s', 'nolan-2000s', 'user:00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000501', 51902, 'Pack On Owner Turn', '2026-02-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000503', 'Pack Only Rotation', '00000000-0000-0000-0000-000000000501', null, null, null, '00000000-0000-0000-0000-000000000501', 52901, 'Owner History', '2026-01-01T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000503', 'Pack Only Rotation', '00000000-0000-0000-0000-000000000502', null, null, null, '00000000-0000-0000-0000-000000000501', 52902, 'Member History', '2026-02-01T00:00:00Z');

-- Shape

select has_column('public', 'bowls', 'starter_pack', 'bowls record their installed pack');
select has_column('public', 'bowls', 'starter_pack_installed_at', 'bowls record when their pack was installed');
select has_column('public', 'bowl_movies', 'starter_pack', 'slips carry a pack marker');
select has_column('public', 'bowl_draw_events', 'starter_pack', 'draws snapshot the pack marker');
select has_column('public', 'bowl_draw_events', 'turn_bucket_key', 'draws record whose turn they spent');

select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, starter_pack, added_by_name, tmdb_id, title)
     values ('10000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502', 'nolan-2000s', 'Nolan', 50901, 'Owned Pack Slip') $$,
  '23514',
  null,
  'a pack slip cannot belong to an account'
);
select throws_ok(
  $$ update public.bowl_movies set is_pinned = true where id = '20000000-0000-0000-0000-000000000513' $$,
  '23514',
  null,
  'a pack slip cannot be pinned'
);
select throws_ok(
  $$ update public.bowls set starter_pack = 'nolan-2000s' where id = '10000000-0000-0000-0000-000000000505' $$,
  '23514',
  null,
  'a bowl cannot name a pack without an installation time'
);

select ok(
  has_function_privilege('authenticated', 'public.install_bowl_starter_pack(uuid,text,text,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.remove_bowl_starter_pack(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.claim_bowl_starter_pack_movie(uuid,bigint,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.draw_bowl_movie(uuid,text,text)', 'EXECUTE'),
  'signed-in callers can reach the pack functions and the turn-aware draw'
);
select ok(
  not has_function_privilege('anon', 'public.install_bowl_starter_pack(uuid,text,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.remove_bowl_starter_pack(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.claim_bowl_starter_pack_movie(uuid,bigint,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.draw_bowl_movie(uuid,text,text)', 'EXECUTE'),
  'anonymous callers cannot reach any of them'
);
select ok(
  not has_function_privilege('authenticated', 'public._record_bowl_movie_draw(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._bowl_contributor_bucket_key(uuid,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._starter_pack_movie_row(jsonb)', 'EXECUTE'),
  'the private helpers stay private'
);
select is(
  (
    select array_agg(proname::text order by proname::text)
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('install_bowl_starter_pack', 'remove_bowl_starter_pack', 'claim_bowl_starter_pack_movie')
      and prosecdef
      and proconfig = array['search_path=public']
  ),
  array['claim_bowl_starter_pack_movie', 'install_bowl_starter_pack', 'remove_bowl_starter_pack'],
  'the pack functions are security definer with a fixed search path'
);
select ok(
  to_regprocedure('public.draw_bowl_movie(uuid,text)') is not null,
  'the two-argument ordinary draw is kept, so its callers resolve unambiguously'
);

-- Install: who may

set local role anon;
select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'spielberg-1980s', 'Spielberg: The ''80s', '[{"tmdb_id": 50101, "title": "Pack A"}]') $$,
  '42501',
  null,
  'a signed-out caller cannot install a pack'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000504","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'spielberg-1980s', 'Spielberg: The ''80s', '[{"tmdb_id": 50101, "title": "Pack A"}]') $$,
  '42501',
  'Only the bowl owner can add a starter pack.',
  'an outsider cannot install a pack'
);
select throws_ok(
  $$ select public.remove_bowl_starter_pack('10000000-0000-0000-0000-000000000502') $$,
  '42501',
  'Only the bowl owner can remove a starter pack.',
  'an outsider cannot remove a pack'
);
select throws_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000502', 51003) $$,
  '42501',
  'You no longer have access to this bowl.',
  'an outsider cannot claim a pack slip'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'spielberg-1980s', 'Spielberg: The ''80s', '[{"tmdb_id": 50101, "title": "Pack A"}]') $$,
  '42501',
  'Only the bowl owner can add a starter pack.',
  'a member cannot install a pack'
);
select throws_ok(
  $$ select public.remove_bowl_starter_pack('10000000-0000-0000-0000-000000000502') $$,
  '42501',
  'Only the bowl owner can remove a starter pack.',
  'a member cannot remove a pack'
);
select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title)
     values ('10000000-0000-0000-0000-000000000501', null, 'Spielberg', 'spielberg-1980s', 50902, 'Forged Pack Slip') $$,
  '42501',
  null,
  'a member cannot write a pack slip directly'
);
reset role;

select is(
  (select count(*)::integer from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and starter_pack is not null),
  0,
  'no refused call left a pack slip behind'
);

-- Install: what lands

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'spielberg-1980s', 'Spielberg: The ''80s', '[{"tmdb_id": -5, "title": "Custom"}]') $$,
  '22023',
  'Starter pack titles must be TMDB titles.',
  'a custom title cannot be part of a pack'
);
select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'Spielberg 80s', 'Spielberg: The ''80s', '[{"tmdb_id": 50101, "title": "Pack A"}]') $$,
  '22023',
  'That starter pack is not recognized.',
  'a malformed pack slug is refused'
);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000501',
    'spielberg-1980s',
    'Spielberg: The ''80s',
    '[{"tmdb_id": 50101, "title": "Pack A", "genres": ["Adventure"], "runtime": "115", "release_date": "1981-06-12"},
      {"tmdb_id": 50002, "title": "Member Own"},
      {"id": 50102, "title": "Pack B"},
      {"tmdb_id": 50101, "title": "Pack A again"}]'
  ),
  '{"starter_pack": "spielberg-1980s", "inserted": [50101, 50102], "already_in_bowl": [50002], "over_limit": [], "pack_slips": 2}'::jsonb,
  'install adds new titles and skips one already in the bowl, and a repeat in the batch'
);

reset role;

select is(
  (select starter_pack from public.bowls where id = '10000000-0000-0000-0000-000000000501'),
  'spielberg-1980s',
  'the bowl records its installed pack'
);
select ok(
  (select starter_pack_installed_at is not null from public.bowls where id = '10000000-0000-0000-0000-000000000501'),
  'and when it was installed'
);
select is(
  (
    select array_agg(row(added_by, added_by_name, starter_pack, runtime, release_date, genres)::text order by tmdb_id)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000501' and starter_pack is not null
  ),
  array[
    row(null::uuid, 'Spielberg: The ''80s', 'spielberg-1980s', 115, '1981-06-12'::date, array['Adventure'])::text,
    row(null::uuid, 'Spielberg: The ''80s', 'spielberg-1980s', null::integer, null::date, '{}'::text[])::text
  ],
  'pack slips belong to nobody, carry the pack name and slug, and keep their snapshot'
);
select is(
  (select added_by from public.bowl_movies where tmdb_id = 50002 and bowl_id = '10000000-0000-0000-0000-000000000501'),
  '00000000-0000-0000-0000-000000000502'::uuid,
  'the member title a pack also holds stays the member''s'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select throws_ok(
  $$ select public.install_bowl_starter_pack('10000000-0000-0000-0000-000000000501', 'nolan-2000s', 'Nolan: The ''00s', '[{"tmdb_id": 50201, "title": "Other Pack"}]') $$,
  'P0001',
  'This bowl already has a starter pack. Remove it before adding another.',
  'a second pack is refused while one is installed'
);

-- "Pull more": the same pack tops up to fifteen and no further.
select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000501',
    'spielberg-1980s',
    'Spielberg: The ''80s',
    (select jsonb_agg(jsonb_build_object('tmdb_id', 50110 + n, 'title', 'More ' || n) order by n) from generate_series(1, 16) n)
  ) - 'inserted',
  jsonb_build_object(
    'starter_pack', 'spielberg-1980s',
    'already_in_bowl', '[]'::jsonb,
    'over_limit', (select jsonb_agg(50110 + n order by n) from generate_series(14, 16) n),
    'pack_slips', 15
  ),
  'pulling more tops the pack up to fifteen undrawn slips'
);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000504',
    'hanks-1990s',
    'Tom Hanks: The ''90s',
    '[{"tmdb_id": 54901, "title": "One"}, {"tmdb_id": 54902, "title": "Two"}]'
  ),
  '{"starter_pack": "hanks-1990s", "inserted": [54901], "already_in_bowl": [], "over_limit": [54902], "pack_slips": 1}'::jsonb,
  'install stops at the bowl limit'
);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000505',
    'hanks-1990s',
    'Tom Hanks: The ''90s',
    '[{"tmdb_id": 55001, "title": "Already Here"}]'
  ),
  '{"starter_pack": null, "inserted": [], "already_in_bowl": [55001], "over_limit": [], "pack_slips": 0}'::jsonb,
  'an install that lands nothing says so'
);
reset role;

select is(
  (select starter_pack from public.bowls where id = '10000000-0000-0000-0000-000000000505'),
  null,
  'and leaves nothing installed'
);

-- Claiming

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);

select throws_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000501', 50002) $$,
  'P0001',
  'This movie is no longer in the starter pack.',
  'a title that is not a pack slip cannot be claimed'
);
select is(
  (
    select row(claimed.added_by, claimed.added_by_name, claimed.starter_pack, claimed.note)::text
    from public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000501', 50101, '  Saw it as a kid  ') claimed
  ),
  row('00000000-0000-0000-0000-000000000502'::uuid, null::text, null::text, 'Saw it as a kid')::text,
  'a member claims a pack slip: it becomes theirs, with their comment'
);
select throws_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000501', 50101) $$,
  'P0001',
  'This movie is no longer in the starter pack.',
  'a claimed slip cannot be claimed again'
);
select lives_ok(
  $$ select public.set_own_bowl_movie_pin((select id from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50101), true) $$,
  'the claimer can pin the title they claimed'
);
reset role;

select is(
  (select count(*)::integer from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50101 and drawn_at is null),
  1,
  'claiming converts the slip rather than adding a second copy'
);

-- Person-first draws record the turn a pack slip was drawn on

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select lives_ok(
  $$ select public.draw_bowl_movie(
       (select id from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50102),
       'UTC',
       'user:00000000-0000-0000-0000-000000000502') $$,
  'a person-first draw of a pack slip names the turn it was drawn on'
);
select lives_ok(
  $$ select public.draw_bowl_movie(
       (select id from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50111),
       'UTC',
       'user:00000000-0000-0000-0000-000000000504') $$,
  'a turn naming someone with no pile in the bowl still draws'
);
select lives_ok(
  $$ select public.draw_bowl_movie('20000000-0000-0000-0000-000000000501', 'UTC', 'user:00000000-0000-0000-0000-000000000502') $$,
  'a turn passed with an ordinary slip still draws'
);
select lives_ok(
  $$ select public.draw_bowl_movie('20000000-0000-0000-0000-000000000562', 'UTC', 'user:00000000-0000-0000-0000-000000000502') $$,
  'a title-first draw of a pack slip still draws'
);
reset role;

select is(
  (
    select row(added_by, added_by_name, starter_pack, turn_bucket_key)::text
    from public.bowl_draw_events
    where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50102
  ),
  row(null::uuid, 'Spielberg: The ''80s', 'spielberg-1980s', 'user:00000000-0000-0000-0000-000000000502')::text,
  'the draw snapshots the pack and keeps the turn'
);
select is(
  (select turn_bucket_key from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50111),
  null,
  'a turn for someone with no pile is not kept'
);
select is(
  (select turn_bucket_key from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50001),
  null,
  'an ordinary slip keeps no turn: its contributor already names it'
);
select is(
  (select turn_bucket_key from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000506' and tmdb_id = 56002),
  null,
  'title-first has no turns to keep'
);

-- Rotation

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

-- The owner's pack win spent their turn, so the member is next -- and the
-- title comes from the member's pile, which holds the pack too.
select ok(
  (
    select bowl_movie_id in (
      '20000000-0000-0000-0000-000000000512',
      '20000000-0000-0000-0000-000000000513',
      '20000000-0000-0000-0000-000000000514'
    )
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000502',
      array[
        '20000000-0000-0000-0000-000000000511',
        '20000000-0000-0000-0000-000000000512',
        '20000000-0000-0000-0000-000000000513',
        '20000000-0000-0000-0000-000000000514'
      ]::uuid[],
      'UTC'
    )
  ),
  'a pack win on a turn spends that turn, and rotation moves to the next person'
);
reset role;

select is(
  (select turn_bucket_key from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000502' order by drawn_at desc limit 1),
  'user:00000000-0000-0000-0000-000000000502',
  'rotation records the turn it spent'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select lives_ok(
  $$ select * from public.draw_bowl_movie_by_rotation(
       '10000000-0000-0000-0000-000000000502',
       (select array_agg(id) from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000502' and drawn_at is null),
       'UTC') $$,
  'the next rotation draw runs'
);
reset role;

-- Both draws share the transaction's clock, so they are told apart by turn.
select is(
  (
    select array_agg(turn_bucket_key order by turn_bucket_key)
    from public.bowl_draw_events
    where bowl_id = '10000000-0000-0000-0000-000000000502' and drawn_at > '2026-03-01'
  ),
  array['user:00000000-0000-0000-0000-000000000501', 'user:00000000-0000-0000-0000-000000000502'],
  'and it is the owner''s turn again'
);

-- A pin still leads its owner's pile, ahead of the pack.
update public.bowl_movies
set is_pinned = true
where id = '20000000-0000-0000-0000-000000000522';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);

-- Nobody owns an eligible title, so the pack is the draw and no turn is spent.
select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000503',
      array['20000000-0000-0000-0000-000000000523']::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000523'::uuid,
  'a pack-only pool draws from the pack'
);
reset role;

select is(
  (
    select row(starter_pack, turn_bucket_key)::text
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000523'
  ),
  row('nolan-2000s', null::text)::text,
  'and spends nobody''s turn'
);
select is(
  (select starter_pack from public.bowls where id = '10000000-0000-0000-0000-000000000503'),
  'nolan-2000s',
  'a bowl whose last pack slip was drawn still reports its pack'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000503',
      array['20000000-0000-0000-0000-000000000521', '20000000-0000-0000-0000-000000000522']::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000521'::uuid,
  'after a pack-only draw, the person whose turn it was is still next'
);

-- Returning the pack draw puts back a pack slip, not a guest's.
select lives_ok(
  $$ select public.return_bowl_draw_to_bowl(
       (select id from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000523')) $$,
  'a pack draw can be returned inside the undo window'
);
reset role;

select is(
  (
    select row(added_by, added_by_name, starter_pack)::text
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000503' and tmdb_id = 52003 and drawn_at is null
  ),
  row(null::uuid, 'Nolan: The ''00s', 'nolan-2000s')::text,
  'the returned slip is a pack slip again'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000503',
      array[
        '20000000-0000-0000-0000-000000000522',
        (select id from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000503' and tmdb_id = 52003 and drawn_at is null)
      ]::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000522'::uuid,
  'a pinned title leads its owner''s pile ahead of the pack'
);
reset role;

-- Removal

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select is(
  public.remove_bowl_starter_pack('10000000-0000-0000-0000-000000000501'),
  12,
  'removal deletes the undrawn pack slips'
);
reset role;

select is(
  (
    select row(starter_pack, starter_pack_installed_at)::text
    from public.bowls where id = '10000000-0000-0000-0000-000000000501'
  ),
  row(null::text, null::timestamptz)::text,
  'and clears the installation'
);
select is(
  (select count(*)::integer from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and starter_pack is not null and drawn_at is not null),
  2,
  'drawn pack slips stay as history'
);
select is(
  (select added_by from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000501' and tmdb_id = 50101),
  '00000000-0000-0000-0000-000000000502'::uuid,
  'a claimed title stays with its claimer'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);

select is(
  public.install_bowl_starter_pack(
    '10000000-0000-0000-0000-000000000501',
    'nolan-2000s',
    'Nolan: The ''00s',
    '[{"tmdb_id": 50201, "title": "Other Pack"}]'
  ) -> 'inserted',
  '[50201]'::jsonb,
  'after removal a different pack can be installed'
);
select is(
  public.remove_bowl_starter_pack('10000000-0000-0000-0000-000000000505'),
  0,
  'removing from a bowl with no pack does nothing'
);
reset role;

select * from finish();
rollback;

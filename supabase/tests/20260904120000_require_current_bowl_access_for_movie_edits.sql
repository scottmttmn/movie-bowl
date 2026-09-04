-- Covers the current-bowl-access boundary added to update_own_bowl_movie_note
-- and set_own_bowl_movie_pin: both already checked ownership, attribution,
-- and undrawn state, but not whether the caller still has current access to
-- the row's bowl. UNRUN in this environment -- see the PR description.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(21);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000111', 'access-owner@example.com'),
  ('00000000-0000-0000-0000-000000000112', 'access-member@example.com'),
  ('00000000-0000-0000-0000-000000000113', 'access-removed@example.com'),
  ('00000000-0000-0000-0000-000000000115', 'access-unrelated@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000111',
  '00000000-0000-0000-0000-000000000112',
  '00000000-0000-0000-0000-000000000113',
  '00000000-0000-0000-0000-000000000115'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  (
    '10000000-0000-0000-0000-000000000111',
    'Access Bowl',
    '00000000-0000-0000-0000-000000000111',
    'person_first'
  ),
  (
    '10000000-0000-0000-0000-000000000112',
    'Unrelated Bowl',
    '00000000-0000-0000-0000-000000000115',
    'person_first'
  );

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000111', 'Owner'),
  ('10000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000112', 'Member'),
  ('10000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000113', 'Member'),
  ('10000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000115', 'Owner');

insert into public.bowl_add_links (
  id, bowl_id, token, created_by, max_adds, adds_used, default_contributor_name
)
values (
  '30000000-0000-0000-0000-000000000111',
  '10000000-0000-0000-0000-000000000111',
  'access-fix-link',
  '00000000-0000-0000-0000-000000000111',
  2,
  0,
  'Guest'
);

-- Every row below lives in Access Bowl (10000000-...-111) unless noted, and
-- starts undrawn/unpinned/uncommented so each scenario tests one boundary.
insert into public.bowl_movies (
  id, bowl_id, added_by, added_by_name, added_via_link_id, tmdb_id, title, drawn_at, drawn_by
)
values
  (
    '20000000-0000-0000-0000-000000000111',
    '10000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000111',
    null,
    null,
    9111,
    'Owner Row',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000112',
    '10000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000112',
    null,
    null,
    9112,
    'Member Row',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000113',
    '10000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000113',
    null,
    null,
    9113,
    'Removed Contributor Row',
    null,
    null
  ),
  -- Never a member of Access Bowl -- only of Unrelated Bowl. This is the row
  -- that isolates the fix: ownership, attribution, and undrawn state all
  -- pass, so only the new current-access check can block it, and it proves
  -- that check is scoped to this row's bowl rather than to any membership.
  (
    '20000000-0000-0000-0000-000000000115',
    '10000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000115',
    null,
    null,
    9115,
    'Unrelated Contributor Row',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000121',
    '10000000-0000-0000-0000-000000000111',
    null,
    'Guest',
    '30000000-0000-0000-0000-000000000111',
    9121,
    'Link Row',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000131',
    '10000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000111',
    null,
    null,
    9131,
    'Drawn Row',
    now(),
    '00000000-0000-0000-0000-000000000111'
  );

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_own_bowl_movie_note(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can call the comment RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.update_own_bowl_movie_note(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot call the comment RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.set_own_bowl_movie_pin(uuid,boolean)',
    'EXECUTE'
  ),
  'authenticated users can call the pin RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_own_bowl_movie_pin(uuid,boolean)',
    'EXECUTE'
  ),
  'anonymous users cannot call the pin RPC'
);

-- Removed after creating their own row, before any RPC call is attempted --
-- this is the state the defect left unchecked.
delete from public.bowl_members
where bowl_id = '10000000-0000-0000-0000-000000000111'
  and user_id = '00000000-0000-0000-0000-000000000113';

select is(
  (
    select count(*)
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000111'
      and user_id = '00000000-0000-0000-0000-000000000113'
  ),
  0::bigint,
  'the removed contributor no longer has a membership row in the bowl'
);

-- update_own_bowl_movie_note --------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000111","email":"access-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select lives_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000111', 'Owner note')$$,
  'the bowl owner can edit their own undrawn comment'
);
select is(
  (select note from public.bowl_movies where id = '20000000-0000-0000-0000-000000000111'),
  'Owner note',
  'the owner comment update is persisted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000112","email":"access-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000112', true);

select lives_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000112', 'Member note')$$,
  'a current member can edit their own undrawn comment'
);
select is(
  (select note from public.bowl_movies where id = '20000000-0000-0000-0000-000000000112'),
  'Member note',
  'the current member comment update is persisted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000113","email":"access-removed@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000113', true);

select throws_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000113', 'Too late to edit')$$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'a contributor removed from the bowl cannot edit their own former comment'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000115","email":"access-unrelated@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000115', true);

select throws_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000115', 'Never had access')$$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'a contributor unrelated to the bowl cannot edit a row they created before the check, by id alone'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000111","email":"access-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select throws_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000121', 'Claimed by link creator')$$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'a link-created row remains uneditable regardless of current bowl access'
);
select throws_ok(
  $$select public.update_own_bowl_movie_note('20000000-0000-0000-0000-000000000131', 'Too late, already drawn')$$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'an already-drawn row remains uneditable regardless of current bowl access'
);

-- set_own_bowl_movie_pin --------------------------------------------------

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000111","email":"access-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000111', true)$$,
  'the bowl owner can pin their own undrawn movie'
);
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000111'),
  true,
  'the owner pin is persisted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000112","email":"access-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000112', true);

select lives_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000112', true)$$,
  'a current member can pin their own undrawn movie'
);
select is(
  (select is_pinned from public.bowl_movies where id = '20000000-0000-0000-0000-000000000112'),
  true,
  'the current member pin is persisted'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000113","email":"access-removed@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000113', true);

select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000113', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'a contributor removed from the bowl cannot pin their own former movie'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000115","email":"access-unrelated@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000115', true);

select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000115', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'a contributor unrelated to the bowl cannot pin a row they created before the check, by id alone'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000111","email":"access-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000111', true);

select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000121', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'a link-created row remains unpinnable regardless of current bowl access'
);
select throws_ok(
  $$select public.set_own_bowl_movie_pin('20000000-0000-0000-0000-000000000131', true)$$,
  'P0001',
  'This movie is no longer available to pin.',
  'an already-drawn row remains unpinnable regardless of current bowl access'
);

reset role;

select * from finish();
rollback;

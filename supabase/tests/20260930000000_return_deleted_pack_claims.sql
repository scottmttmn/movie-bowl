begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000b01', 'return-owner@example.com'),
  ('00000000-0000-0000-0000-000000000b02', 'return-member@example.com'),
  ('00000000-0000-0000-0000-000000000b03', 'return-outsider@example.com');

insert into public.profiles (id, email)
select id, email from auth.users
where id::text like '00000000-0000-0000-0000-000000000b0%';

insert into public.bowls (id, name, owner_id, starter_pack, starter_pack_installed_at) values
  ('10000000-0000-0000-0000-000000000b01', 'Return Pack', '00000000-0000-0000-0000-000000000b01', 'nolan-2000s', now()),
  ('10000000-0000-0000-0000-000000000b02', 'Pack Swapped', '00000000-0000-0000-0000-000000000b01', 'nolan-2000s', now());

insert into public.bowl_members (bowl_id, user_id, role)
select bowl.id, participant.user_id, participant.role
from public.bowls bowl
cross join (values
  ('00000000-0000-0000-0000-000000000b01'::uuid, 'Owner'::text),
  ('00000000-0000-0000-0000-000000000b02'::uuid, 'Member'::text)
) participant(user_id, role)
where bowl.id::text like '10000000-0000-0000-0000-000000000b0%';

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title) values
  ('20000000-0000-0000-0000-000000000b01', '10000000-0000-0000-0000-000000000b01', null, 'Nolan: The ''00s', 'nolan-2000s', 61001, 'Memento'),
  ('20000000-0000-0000-0000-000000000b02', '10000000-0000-0000-0000-000000000b01', null, 'Nolan: The ''00s', 'nolan-2000s', 61002, 'Insomnia'),
  ('20000000-0000-0000-0000-000000000b03', '10000000-0000-0000-0000-000000000b02', null, 'Nolan: The ''00s', 'nolan-2000s', 61003, 'The Prestige');

-- The member's own title, and one claimed before claims remembered their pack.
insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title) values
  ('20000000-0000-0000-0000-000000000b04', '10000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b02', 61004, 'Own Title'),
  ('20000000-0000-0000-0000-000000000b05', '10000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b02', 61005, 'Claimed Long Ago');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);

select is(
  (public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000b01', 61001, 'Mine now')).claimed_from_starter_pack,
  'nolan-2000s',
  'a claim remembers the pack it came from'
);
select is(
  (select claimed_from_starter_pack_name from public.bowl_movies where id = '20000000-0000-0000-0000-000000000b01'),
  'Nolan: The ''00s',
  'and the name the slip carried'
);

reset role;
update public.bowl_movies set is_pinned = true where id = '20000000-0000-0000-0000-000000000b01';
set local role authenticated;

select is(
  public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') -> 'returned_to_pack',
  'true'::jsonb,
  'deleting a claimed pack title reports that it went back to the pack'
);

reset role;

select results_eq(
  $$ select added_by, added_by_name, starter_pack, claimed_from_starter_pack, note, is_pinned
     from public.bowl_movies where id = '20000000-0000-0000-0000-000000000b01' $$,
  $$ values (null::uuid, 'Nolan: The ''00s'::text, 'nolan-2000s'::text, null::text, null::text, false) $$,
  'it is a pack slip again, with no owner, comment or pin'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);

select is(
  (public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000b01', 61001)).added_by,
  '00000000-0000-0000-0000-000000000b02'::uuid,
  'and it can be claimed again'
);

select is(
  public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b04') -> 'returned_to_pack',
  'false'::jsonb,
  'deleting a title that was never in a pack reports a deletion'
);
select is(
  public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b05') -> 'returned_to_pack',
  'false'::jsonb,
  'as does one claimed before claims were remembered'
);

reset role;
select is(
  (select count(*)::integer from public.bowl_movies
   where id in ('20000000-0000-0000-0000-000000000b04', '20000000-0000-0000-0000-000000000b05')),
  0,
  'and both are gone'
);
set local role authenticated;

-- Someone else's title, as the owner.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b01","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') $$,
  'P0001',
  'This movie is no longer available to remove.',
  'the owner cannot remove another member''s claim through this path'
);
select throws_ok(
  $$ select public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b02') $$,
  'P0001',
  'This movie is no longer available to remove.',
  'nor an unclaimed pack slip'
);

-- An outsider.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b03","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') $$,
  '42501',
  null,
  'someone outside the bowl cannot call it'
);

-- Signed out.
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') $$,
  '42501',
  null,
  'nor someone signed out'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.remove_own_bowl_movie(uuid, uuid)', 'execute'),
  'anon cannot execute it'
);

-- A drawn claim stays drawn.
update public.bowl_movies set drawn_at = now() where id = '20000000-0000-0000-0000-000000000b01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);
select throws_ok(
  $$ select public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') $$,
  'P0001',
  'This movie is no longer available to remove.',
  'a drawn claim cannot be removed or returned'
);
reset role;

-- The pack the claim came from is no longer the bowl's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);
select lives_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000b02', 61003) $$,
  'a member claims from the second bowl''s pack'
);
reset role;

update public.bowls set starter_pack = 'best-picture-1990s' where id = '10000000-0000-0000-0000-000000000b02';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);
select is(
  public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b02', '20000000-0000-0000-0000-000000000b03') -> 'returned_to_pack',
  'false'::jsonb,
  'a claim from a pack that has since been replaced deletes instead'
);
reset role;
select ok(
  not exists (select 1 from public.bowl_movies where id = '20000000-0000-0000-0000-000000000b03'),
  'and it is gone'
);

-- Removing the pack entirely does the same.
update public.bowls set starter_pack = null, starter_pack_installed_at = null
where id = '10000000-0000-0000-0000-000000000b01';
update public.bowl_movies set drawn_at = null where id = '20000000-0000-0000-0000-000000000b01';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b02","role":"authenticated"}', true);
select is(
  public.remove_own_bowl_movie('10000000-0000-0000-0000-000000000b01', '20000000-0000-0000-0000-000000000b01') -> 'returned_to_pack',
  'false'::jsonb,
  'with no pack installed, a claim deletes'
);
reset role;

select throws_ok(
  $$ update public.bowl_movies
     set starter_pack = 'nolan-2000s', added_by = null, added_by_name = 'Pack',
         claimed_from_starter_pack = 'nolan-2000s', claimed_from_starter_pack_name = 'Pack'
     where id = '20000000-0000-0000-0000-000000000b02' $$,
  '23514',
  null,
  'a slip cannot be both in a pack and claimed from one'
);
select throws_ok(
  $$ update public.bowl_movies
     set claimed_from_starter_pack = 'nolan-2000s'
     where id = '20000000-0000-0000-0000-000000000b02' $$,
  '23514',
  null,
  'the origin and its name are recorded together'
);

-- A bowl deletion still cascades through claimed rows.
insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title, claimed_from_starter_pack, claimed_from_starter_pack_name)
values ('10000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-000000000b02', 61009, 'Claimed', 'nolan-2000s', 'Nolan');
select lives_ok(
  $$ delete from public.bowls where id = '10000000-0000-0000-0000-000000000b01' $$,
  'deleting the bowl is not turned into a return'
);
select ok(
  not exists (select 1 from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000b01'),
  'and takes its titles with it'
);

select * from finish();

rollback;

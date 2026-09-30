begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000c01', 'guard-owner@example.com'),
  ('00000000-0000-0000-0000-000000000c02', 'guard-member@example.com');

insert into public.profiles (id, email)
select id, email from auth.users
where id::text like '00000000-0000-0000-0000-000000000c0%';

insert into public.bowls (id, name, owner_id, starter_pack, starter_pack_installed_at) values
  ('10000000-0000-0000-0000-000000000c01', 'Guarded Pack', '00000000-0000-0000-0000-000000000c01', 'nolan-2000s', now());

insert into public.bowl_members (bowl_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000c01', 'Owner'),
  ('10000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000c02', 'Member');

insert into public.bowl_movies (id, bowl_id, added_by, added_by_name, starter_pack, tmdb_id, title) values
  ('20000000-0000-0000-0000-000000000c01', '10000000-0000-0000-0000-000000000c01', null, 'Nolan: The ''00s', 'nolan-2000s', 62001, 'Memento'),
  ('20000000-0000-0000-0000-000000000c02', '10000000-0000-0000-0000-000000000c01', null, 'Nolan: The ''00s', 'nolan-2000s', 62002, 'Insomnia');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c02","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title, claimed_from_starter_pack, claimed_from_starter_pack_name)
     values ('10000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000c02', 62003, 'Forged', 'nolan-2000s', 'Nolan: The ''00s') $$,
  '42501',
  null,
  'a member cannot insert a title that claims to come from the pack'
);
select lives_ok(
  $$ insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
     values ('20000000-0000-0000-0000-000000000c03', '10000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-000000000c02', 62004, 'Honest') $$,
  'an ordinary insert still works'
);

select lives_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000c01', 62001) $$,
  'the claim is still the way a title gets its origin'
);

-- A direct delete the policy refuses removes nothing rather than raising, so
-- each one is checked by what is left afterwards.
delete from public.bowl_movies
where id in ('20000000-0000-0000-0000-000000000c01', '20000000-0000-0000-0000-000000000c03');

reset role;
select is(
  (select claimed_from_starter_pack from public.bowl_movies where id = '20000000-0000-0000-0000-000000000c01'),
  'nolan-2000s',
  'a direct delete leaves the member''s claimed title alone'
);
select is(
  (select count(*)::int from public.bowl_movies where id = '20000000-0000-0000-0000-000000000c03'),
  0,
  'and still deletes the member''s own title'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c01","role":"authenticated"}', true);
select lives_ok(
  $$ select public.claim_bowl_starter_pack_movie('10000000-0000-0000-0000-000000000c01', 62002) $$,
  'the owner claims one too'
);
delete from public.bowl_movies
where id in ('20000000-0000-0000-0000-000000000c01', '20000000-0000-0000-0000-000000000c02');

reset role;
select is(
  (select count(*)::int from public.bowl_movies
   where id in ('20000000-0000-0000-0000-000000000c01', '20000000-0000-0000-0000-000000000c02')
     and claimed_from_starter_pack = 'nolan-2000s'),
  2,
  'a direct delete leaves claimed titles alone for the owner as well'
);

select * from finish();
rollback;

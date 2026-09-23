begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000201', 'remove-owner@example.com'),
  ('00000000-0000-0000-0000-000000000202', 'remove-member@example.com'),
  ('00000000-0000-0000-0000-000000000203', 'remove-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000203'
);

-- The member owns a bowl of their own, so "owns a bowl" is not mistaken for
-- "owns this bowl".
insert into public.bowls (id, name, owner_id)
values
  ('10000000-0000-0000-0000-000000000201', 'Remove Bowl', '00000000-0000-0000-0000-000000000201'),
  ('10000000-0000-0000-0000-000000000202', 'Member Bowl', '00000000-0000-0000-0000-000000000202'),
  ('10000000-0000-0000-0000-000000000203', 'Rotation Remove Bowl', '00000000-0000-0000-0000-000000000201');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Member'),
  ('10000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000202', 'Member');

insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title)
values
  ('20000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 20201, 'Nobody Watched'),
  ('20000000-0000-0000-0000-000000000202', '10000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000201', 20202, 'Put Back First'),
  ('20000000-0000-0000-0000-000000000203', '10000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000201', 20203, 'Owner Turn'),
  ('20000000-0000-0000-0000-000000000204', '10000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000202', 20204, 'Member Turn'),
  ('20000000-0000-0000-0000-000000000205', '10000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000201', 20205, 'Owner Second');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","email":"remove-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);

select public.draw_bowl_movie('20000000-0000-0000-0000-000000000201', 'UTC');
select public.draw_bowl_movie('20000000-0000-0000-0000-000000000202', 'UTC');

reset role;

select set_config(
  'test.remove_draw_event_id',
  (select id::text from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000201'),
  true
);
select set_config(
  'test.returned_draw_event_id',
  (select id::text from public.bowl_draw_events where source_bowl_movie_id = '20000000-0000-0000-0000-000000000202'),
  true
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","email":"remove-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
select public.return_bowl_draw_to_bowl(current_setting('test.returned_draw_event_id')::uuid);
reset role;

-- Past the undo window, which is the case this exists for.
update public.bowl_draw_events
set drawn_at = now() - interval '3 days'
where id = current_setting('test.remove_draw_event_id')::uuid;

select is(
  (select count(*)::integer from public.user_watch_events where source_draw_event_id = current_setting('test.remove_draw_event_id')::uuid),
  2,
  'the draw gave the owner and the member a personal history row each'
);

-- Refused: signed out, an outsider, a member, and the owner of a different bowl.
set local role anon;
select throws_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.remove_draw_event_id')::uuid) $$,
  '42501',
  null,
  'a signed-out caller cannot run the removal at all'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000203","email":"remove-outsider@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);
select throws_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.remove_draw_event_id')::uuid) $$,
  '42501',
  'Only the bowl owner can remove a movie from its watched history.',
  'an outsider cannot remove a draw'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000202","email":"remove-member@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select throws_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.remove_draw_event_id')::uuid) $$,
  '42501',
  'Only the bowl owner can remove a movie from its watched history.',
  'a member, who owns a bowl of their own and added the movie, still cannot remove it'
);
reset role;

select ok(
  (select removed_at is null from public.bowl_draw_events where id = current_setting('test.remove_draw_event_id')::uuid),
  'refused callers left the draw in the watched history'
);

-- Allowed: the owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","email":"remove-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);

select lives_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.remove_draw_event_id')::uuid) $$,
  'the owner can remove a draw past the undo window'
);

select lives_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.remove_draw_event_id')::uuid) $$,
  'a retried removal succeeds without changing anything'
);

select throws_ok(
  $$ select public.return_bowl_draw_to_bowl(current_setting('test.remove_draw_event_id')::uuid) $$,
  'P0001',
  'This draw is no longer available to move to the bowl.',
  'a removed draw cannot be put back in the bowl'
);

select throws_ok(
  $$ select public.remove_bowl_draw_from_history(current_setting('test.returned_draw_event_id')::uuid) $$,
  'P0001',
  'This draw is no longer in the bowl''s watched history.',
  'a returned draw is not in the watched history to remove'
);

select throws_ok(
  $$ select public.remove_bowl_draw_from_history('99999999-0000-0000-0000-000000000000'::uuid) $$,
  'P0001',
  'This draw is no longer in the bowl''s watched history.',
  'an unknown draw is refused'
);

select is(
  (select count(*)::integer from public.bowl_draw_events where bowl_id = '10000000-0000-0000-0000-000000000201' and returned_at is null and removed_at is null),
  0,
  'the removed draw has left the bowl''s watched history'
);
reset role;

select ok(
  (
    select removed_by = '00000000-0000-0000-0000-000000000201'
      and removed_at is not null
      and returned_at is null
      and drawn_at is not null
    from public.bowl_draw_events
    where id = current_setting('test.remove_draw_event_id')::uuid
  ),
  'the draw is kept and marked removed by the owner, not returned'
);

select is(
  (select count(*)::integer from public.user_watch_events where source_draw_event_id = current_setting('test.remove_draw_event_id')::uuid),
  2,
  'every participant keeps their personal history row'
);

select is(
  (select count(*)::integer from public.bowl_movies where bowl_id = '10000000-0000-0000-0000-000000000201' and tmdb_id = 20201 and drawn_at is null),
  0,
  'removal does not put the title back in the bowl'
);

-- Rotation: a removed draw still spent that contributor's turn. The owner is
-- drawn and removed; with both contributors then eligible, the member has never
-- been drawn and must go next. Were the removal forgotten, both would be
-- never-drawn and the pick a coin flip.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000201","email":"remove-owner@example.com","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);

select public.save_bowl_draw_method('10000000-0000-0000-0000-000000000203', 'rotation');

select set_config(
  'test.rotation_owner_draw_event_id',
  (
    select draw_event_id::text
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000203',
      array['20000000-0000-0000-0000-000000000203']::uuid[],
      'UTC'
    )
  ),
  true
);

select public.remove_bowl_draw_from_history(current_setting('test.rotation_owner_draw_event_id')::uuid);

select is(
  (
    select bowl_movie_id
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000203',
      array['20000000-0000-0000-0000-000000000204', '20000000-0000-0000-0000-000000000205']::uuid[],
      'UTC'
    )
  ),
  '20000000-0000-0000-0000-000000000204'::uuid,
  'rotation still counts a removed draw, so the never-drawn member goes next'
);
reset role;

-- Deleting the owner's account leaves no trace of who removed the draw. An
-- account that owns bowls cannot be deleted, so hand them over first.
update public.bowls
set owner_id = '00000000-0000-0000-0000-000000000202'
where owner_id = '00000000-0000-0000-0000-000000000201';

select is(
  (public.delete_account_data_for_user('00000000-0000-0000-0000-000000000201', 'remove-owner@example.com') ->> 'deleted'),
  'true',
  'the former owner''s account is deleted'
);

select ok(
  (
    select removed_by is null and removed_at is not null
    from public.bowl_draw_events
    where id = current_setting('test.remove_draw_event_id')::uuid
  ),
  'account deletion clears removed_by and keeps the removal'
);

select * from finish();
rollback;

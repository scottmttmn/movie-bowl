begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select no_plan();

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'profile-owner@example.com'),
  ('00000000-0000-0000-0000-000000000302', 'profile-friend@example.com'),
  ('00000000-0000-0000-0000-000000000303', 'delete-me@example.com'),
  ('00000000-0000-0000-0000-000000000304', 'blocked-owner@example.com');

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-000000000301', 'profile-owner@example.com', 'Owner One'),
  ('00000000-0000-0000-0000-000000000302', 'profile-friend@example.com', 'Movie Friend'),
  ('00000000-0000-0000-0000-000000000303', 'delete-me@example.com', 'Delete Me'),
  ('00000000-0000-0000-0000-000000000304', 'blocked-owner@example.com', 'Blocked Owner');

select throws_ok(
  $$
    update public.profiles
    set display_name = '  Padded Name  '
    where id = '00000000-0000-0000-0000-000000000301'
  $$,
  '23514',
  null,
  'display names must be stored in normalized form'
);

select throws_ok(
  $$
    update public.profiles
    set display_name = ''
    where id = '00000000-0000-0000-0000-000000000301'
  $$,
  '23514',
  null,
  'an empty display name is refused, so clearing one cannot store a blank'
);

select lives_ok(
  $$
    update public.profiles
    set display_name = null
    where id = '00000000-0000-0000-0000-000000000301'
  $$,
  'a display name can be cleared back to absent'
);

-- Put the name back: the transfer and directory assertions below read it.
update public.profiles
set display_name = 'Owner One'
where id = '00000000-0000-0000-0000-000000000301';

select ok(
  has_function_privilege(
    'authenticated',
    'public.transfer_owned_bowl(uuid,uuid)',
    'execute'
  ),
  'signed-in users can call the guarded ownership-transfer function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.transfer_owned_bowl(uuid,uuid)',
    'execute'
  ),
  'anonymous users cannot transfer bowl ownership'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_account_data_for_user(uuid,text)',
    'execute'
  ),
  'the trusted service role can run account cleanup'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_account_data_for_user(uuid,text)',
    'execute'
  ),
  'browser clients cannot run account cleanup'
);

insert into public.bowls (id, name, owner_id, draw_access_mode)
values
  (
    '10000000-0000-0000-0000-000000000301',
    'Transfer Bowl',
    '00000000-0000-0000-0000-000000000301',
    'selected_members'
  ),
  (
    '10000000-0000-0000-0000-000000000304',
    'Owned Bowl Blocks Deletion',
    '00000000-0000-0000-0000-000000000304',
    'all_members'
  );

-- Deliberately omit a membership row for the original owner. Historic bowls
-- can be in this shape, and transfer still has to preserve their access.
insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000302',
    'Member'
  ),
  (
    '10000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000303',
    'Member'
  );

insert into public.bowl_draw_permissions (bowl_id, user_id)
values (
  '10000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000301","email":"profile-owner@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000301',
  true
);

select lives_ok(
  $$
    select public.transfer_owned_bowl(
      '10000000-0000-0000-0000-000000000301',
      '00000000-0000-0000-0000-000000000302'
    )
  $$,
  'an owner can transfer a bowl to a current member'
);

reset role;

select is(
  (
    select owner_id::text
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000301'
  ),
  '00000000-0000-0000-0000-000000000302',
  'the selected member becomes the bowl owner'
);

select is(
  (
    select role
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000301'
      and user_id = '00000000-0000-0000-0000-000000000301'
  ),
  'Member',
  'the former owner is retained as a member even without a prior membership row'
);

select is(
  (
    select role
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000301'
      and user_id = '00000000-0000-0000-0000-000000000302'
  ),
  'Owner',
  'the new owner membership role is updated atomically'
);

select ok(
  exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000301'
      and user_id = '00000000-0000-0000-0000-000000000301'
  )
  and not exists (
    select 1
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000301'
      and user_id = '00000000-0000-0000-0000-000000000302'
  ),
  'selected draw access follows the role change'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000302","email":"profile-friend@example.com","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000302',
  true
);

select is(
  (
    select bool_and(
      to_jsonb(directory) ? 'display_name'
      and not (to_jsonb(directory) ? 'email')
    )
    from public.get_bowl_profile_directory(
      '10000000-0000-0000-0000-000000000301'
    ) directory
  ),
  true,
  'the bowl directory exposes display names but no email field'
);

reset role;

select is(
  (
    public.delete_account_data_for_user(
      '00000000-0000-0000-0000-000000000304',
      'blocked-owner@example.com'
    ) ->> 'code'
  ),
  'owned_bowls',
  'account cleanup is blocked while the user owns a bowl'
);

select ok(
  exists (
    select 1
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000304'
  ),
  'a blocked cleanup does not remove profile data'
);

insert into public.bowl_movies (
  id,
  bowl_id,
  added_by,
  tmdb_id,
  title,
  note,
  drawn_at,
  drawn_by
)
values (
  '20000000-0000-0000-0000-000000000303',
  '10000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000303',
  30303,
  'Delete My Suggestion',
  'Private suggestion note',
  null,
  null
);

insert into public.bowl_draw_events (
  id,
  bowl_id,
  bowl_name,
  added_by,
  drawn_by,
  tmdb_id,
  title,
  note
)
values (
  '30000000-0000-0000-0000-000000000303',
  '10000000-0000-0000-0000-000000000301',
  'Transfer Bowl',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000303',
  30304,
  'Keep Group History',
  'Private historical note'
);

insert into public.user_watch_events (
  id,
  user_id,
  source_draw_event_id,
  source_kind,
  bowl_name,
  tmdb_id,
  title,
  watched_on
)
values (
  '40000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000303',
  '30000000-0000-0000-0000-000000000303',
  'bowl_draw',
  'Transfer Bowl',
  30304,
  'Keep Group History',
  current_date
);

set local role service_role;
select is(
  (
    public.delete_account_data_for_user(
      '00000000-0000-0000-0000-000000000303',
      'delete-me@example.com'
    ) ->> 'deleted'
  ),
  'true',
  'the trusted cleanup removes a non-owner account'
);
reset role;

select ok(
  not exists (
    select 1
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000303'
  )
  and not exists (
    select 1
    from public.bowl_members
    where user_id = '00000000-0000-0000-0000-000000000303'
  )
  and not exists (
    select 1
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000303'
  )
  and not exists (
    select 1
    from public.user_watch_events
    where user_id = '00000000-0000-0000-0000-000000000303'
  ),
  'cleanup removes the profile, membership, suggestion, and personal watch history'
);

select ok(
  (
    select added_by is null
      and added_by_name = 'Former member'
      and drawn_by is null
      and note is null
    from public.bowl_draw_events
    where id = '30000000-0000-0000-0000-000000000303'
  ),
  'cleanup retains shared draw history without the former member identity or note'
);

select * from finish();

rollback;

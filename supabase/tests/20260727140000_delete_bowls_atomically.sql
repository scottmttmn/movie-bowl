begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000011', 'delete-owner@example.com'),
  ('00000000-0000-0000-0000-000000000012', 'delete-member@example.com'),
  ('00000000-0000-0000-0000-000000000013', 'delete-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000013'
);

insert into public.bowls (id, name, owner_id, max_contribution_lead)
values (
  '10000000-0000-0000-0000-000000000011',
  'Atomic Delete Bowl',
  '00000000-0000-0000-0000-000000000011',
  1
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000011',
    'Owner'
  ),
  (
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000012',
    'Member'
  );

insert into public.bowl_draw_permissions (bowl_id, user_id)
values (
  '10000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012'
);

insert into public.bowl_invites (
  id,
  bowl_id,
  invited_email,
  invited_by,
  token
)
values (
  '20000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  'invitee@example.com',
  '00000000-0000-0000-0000-000000000011',
  'atomic-delete-invite'
);

insert into public.bowl_add_links (
  id,
  bowl_id,
  token,
  created_by,
  max_adds
)
values (
  '30000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  'atomic-delete-add-link',
  '00000000-0000-0000-0000-000000000011',
  3
);

insert into public.bowl_movies (
  id,
  bowl_id,
  added_by,
  tmdb_id,
  title,
  drawn_at,
  drawn_by
)
values
  (
    '40000000-0000-0000-0000-000000000011',
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000011',
    1101,
    'Undrawn Movie',
    null,
    null
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '10000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000012',
    1102,
    'Watched Movie',
    '2026-07-20T20:00:00Z',
    '00000000-0000-0000-0000-000000000012'
  );

insert into public.bowl_movie_queue (
  id,
  bowl_id,
  queued_by,
  tmdb_id,
  title
)
values (
  '50000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  1103,
  'Legacy Queued Movie'
);

insert into public.bowl_draw_events (
  id,
  bowl_id,
  source_bowl_movie_id,
  bowl_name,
  added_by,
  drawn_by,
  tmdb_id,
  title,
  drawn_at
)
values (
  '60000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '40000000-0000-0000-0000-000000000012',
  'Atomic Delete Bowl',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000012',
  1102,
  'Watched Movie',
  '2026-07-20T20:00:00Z'
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
  '70000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  '60000000-0000-0000-0000-000000000011',
  'bowl_draw',
  'Atomic Delete Bowl',
  1102,
  'Watched Movie',
  '2026-07-20'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.delete_owned_bowl(uuid)',
    'EXECUTE'
  ),
  'authenticated users can call the atomic bowl delete function'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.delete_owned_bowl(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot call the atomic bowl delete function'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.delete_owned_bowl(uuid)'::regprocedure
  ),
  true,
  'the atomic bowl delete function is security definer'
);

select is(
  (
    select proconfig
    from pg_proc
    where oid = 'public.delete_owned_bowl(uuid)'::regprocedure
  ),
  array['search_path=public']::text[],
  'the atomic bowl delete function fixes its search path'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000013","email":"delete-outsider@example.com","role":"authenticated"}',
  true
);

select throws_ok(
  $sql$
    select public.delete_owned_bowl(
      '10000000-0000-0000-0000-000000000011'
    )
  $sql$,
  '42501',
  'Only the bowl owner can delete this bowl.',
  'a non-owner cannot delete the bowl'
);

reset role;

select is(
  (
    select count(*)
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000011'
  ),
  1::bigint,
  'an unauthorized attempt leaves the bowl intact'
);

select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  2::bigint,
  'an unauthorized attempt leaves bowl movies intact'
);

select is(
  (
    select count(*)
    from public.bowl_movie_queue
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  1::bigint,
  'an unauthorized attempt leaves legacy queue rows intact'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000011","email":"delete-owner@example.com","role":"authenticated"}',
  true
);

select is(
  public.delete_owned_bowl(
    '10000000-0000-0000-0000-000000000011'
  ),
  '10000000-0000-0000-0000-000000000011'::uuid,
  'the owner can atomically delete the bowl'
);

reset role;

select is(
  (
    select count(*)
    from public.bowls
    where id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'the bowl is deleted'
);

select is(
  (
    select count(*)
    from public.bowl_members
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'bowl memberships are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_invites
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'bowl invitations are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'bowl movies are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_draw_permissions
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'draw permissions are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_movie_queue
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'legacy queue rows are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_add_links
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'public add links are deleted'
);

select is(
  (
    select count(*)
    from public.bowl_active_tmdb_movies
    where bowl_id = '10000000-0000-0000-0000-000000000011'
  ),
  0::bigint,
  'the active movie registry is deleted'
);

select ok(
  (
    select bowl_id is null
      and source_bowl_movie_id is null
      and bowl_name = 'Atomic Delete Bowl'
    from public.bowl_draw_events
    where id = '60000000-0000-0000-0000-000000000011'
  ),
  'the durable draw record survives without bowl-owned references'
);

select ok(
  (
    select source_draw_event_id = '60000000-0000-0000-0000-000000000011'
      and bowl_name = 'Atomic Delete Bowl'
      and title = 'Watched Movie'
    from public.user_watch_events
    where id = '70000000-0000-0000-0000-000000000011'
  ),
  'personal watch history survives with its durable draw reference'
);

select is(
  (
    select count(*)
    from public.profiles
    where id in (
      '00000000-0000-0000-0000-000000000011',
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000013'
    )
  ),
  3::bigint,
  'deleting a bowl does not delete user profiles'
);

select * from finish();

rollback;

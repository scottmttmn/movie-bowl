begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'member@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);

insert into public.bowls (id, name, owner_id)
values (
  '10000000-0000-0000-0000-000000000001',
  'RLS Test Bowl',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.bowl_members (bowl_id, user_id, role)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Owner'
  ),
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'Member'
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
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    101,
    'Owner Pick',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    202,
    'Member Pick',
    null,
    null
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    303,
    'Member Drawn Pick',
    now(),
    '00000000-0000-0000-0000-000000000002'
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
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'rls-test-link',
  '00000000-0000-0000-0000-000000000001',
  2,
  0,
  'Guest'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated users retain required profile privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated users cannot delete profiles directly'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users have no direct profile access'
);

select ok(
  has_table_privilege('authenticated', 'public.bowl_movies', 'SELECT')
    and has_table_privilege('authenticated', 'public.bowl_movies', 'INSERT')
    and has_table_privilege('authenticated', 'public.bowl_movies', 'DELETE'),
  'authenticated users retain required bowl movie privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.bowl_movies', 'UPDATE'),
  'authenticated users cannot update bowl movies directly'
);

select ok(
  not has_table_privilege('anon', 'public.bowl_movies', 'SELECT'),
  'anonymous users have no direct bowl movie access'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"member@example.com","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'members can directly read only their own profile'
);

update public.profiles
set email = 'member-updated@example.com'
where id = '00000000-0000-0000-0000-000000000002';

select is(
  (
    select email
    from public.profiles
    where id = '00000000-0000-0000-0000-000000000002'
  ),
  'member-updated@example.com',
  'members can update their own profile'
);

update public.profiles
set email = 'tampered@example.com'
where id = '00000000-0000-0000-0000-000000000001';

select is(
  (
    select email
    from public.get_bowl_profile_directory(
      '10000000-0000-0000-0000-000000000001'
    )
    where user_id = '00000000-0000-0000-0000-000000000001'
  ),
  'owner@example.com',
  'members cannot update another profile'
);

select is(
  (select count(*) from public.bowl_movies),
  3::bigint,
  'members can view movies in their bowl'
);

select lives_ok(
  $sql$
    insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title)
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      404,
      'Member New Pick'
    )
  $sql$,
  'members can insert their own undrawn slips'
);

select throws_ok(
  $sql$
    insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title)
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      405,
      'Forged Owner Pick'
    )
  $sql$,
  '42501',
  'new row violates row-level security policy for table "bowl_movies"',
  'members cannot insert slips attributed to another person'
);

select throws_ok(
  $sql$
    insert into public.bowl_movies (
      bowl_id,
      added_by,
      tmdb_id,
      title,
      drawn_at,
      drawn_by
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      406,
      'Forged Drawn Pick',
      now(),
      '00000000-0000-0000-0000-000000000002'
    )
  $sql$,
  '42501',
  'new row violates row-level security policy for table "bowl_movies"',
  'members cannot insert pre-drawn slips'
);

select throws_ok(
  $sql$
    update public.bowl_movies
    set title = 'Tampered Title'
    where id = '20000000-0000-0000-0000-000000000001'
  $sql$,
  '42501',
  'permission denied for table bowl_movies',
  'members cannot update movie rows directly'
);

delete from public.bowl_movies
where id = '20000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'members cannot delete another contributor''s slip'
);

delete from public.bowl_movies
where id = '20000000-0000-0000-0000-000000000003';

select is(
  (
    select count(*)
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'members cannot delete their own drawn slip'
);

delete from public.bowl_movies
where tmdb_id = 404;

select is(
  (
    select count(*)
    from public.bowl_movies
    where tmdb_id = 404
  ),
  0::bigint,
  'members can delete their own undrawn slip'
);

select lives_ok(
  $sql$
    select public.draw_bowl_movie(
      '20000000-0000-0000-0000-000000000001'
    )
  $sql$,
  'the protected draw function still works without direct update access'
);

select ok(
  (
    select drawn_at is not null
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000001'
  ),
  'the protected draw function records the draw'
);

select lives_ok(
  $sql$
    select public.return_bowl_draw_to_bowl(
      (
        select id
        from public.bowl_draw_events
        where source_bowl_movie_id =
          '20000000-0000-0000-0000-000000000001'
      )
    )
  $sql$,
  'the protected return function can restore another contributor''s slip'
);

select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000001'
      and tmdb_id = 101
      and added_by = '00000000-0000-0000-0000-000000000001'
      and drawn_at is null
  ),
  1::bigint,
  'the returned slip preserves its original contributor'
);

select is(
  (
    select count(*)
    from public.get_bowl_profile_directory(
      '10000000-0000-0000-0000-000000000001'
    )
  ),
  2::bigint,
  'the scoped directory still returns bowl-associated profiles'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000003","email":"outsider@example.com","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.bowl_movies),
  0::bigint,
  'authenticated outsiders cannot view another bowl''s movies'
);

select throws_ok(
  $sql$
    select *
    from public.get_bowl_profile_directory(
      '10000000-0000-0000-0000-000000000001'
    )
  $sql$,
  '42501',
  'Bowl access required',
  'authenticated outsiders cannot use the bowl profile directory'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"owner@example.com","role":"authenticated"}',
  true
);

delete from public.bowl_movies
where id = '20000000-0000-0000-0000-000000000003';

select is(
  (
    select count(*)
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'the bowl owner can delete another contributor''s slip'
);

delete from public.bowl_movies
where bowl_id = '10000000-0000-0000-0000-000000000001';

select is(
  (
    select count(*)
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'the bowl owner can delete all remaining bowl slips'
);

reset role;
set local role anon;
select set_config(
  'request.jwt.claims',
  '{"role":"anon"}',
  true
);

select lives_ok(
  $sql$
    select *
    from public.consume_bowl_add_link(
      'rls-test-link',
      '{"tmdb_id":505,"title":"Guest Pick"}'::jsonb,
      'Guest'
    )
  $sql$,
  'the public add-link function still inserts through its protected path'
);

select throws_ok(
  $sql$
    select * from public.bowl_movies
  $sql$,
  '42501',
  'permission denied for table bowl_movies',
  'anonymous users cannot read bowl movies directly'
);

reset role;

select is(
  (
    select count(*)
    from public.bowl_movies
    where tmdb_id = 505
      and bowl_id = '10000000-0000-0000-0000-000000000001'
      and added_by is null
      and added_via_link_id = '30000000-0000-0000-0000-000000000001'
      and added_by_name = 'Guest'
  ),
  1::bigint,
  'the public add-link function preserves guest and link attribution without claiming a signed-in contributor'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Authenticated users can read profiles'
  ),
  0::bigint,
  'the broad authenticated profile policy is removed'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bowl_movies'
      and cmd = 'UPDATE'
  ),
  0::bigint,
  'no direct bowl movie update policy remains'
);

select * from finish();

rollback;

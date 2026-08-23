begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(39);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000061', 'comment-owner@example.com'),
  ('00000000-0000-0000-0000-000000000062', 'comment-member@example.com'),
  ('00000000-0000-0000-0000-000000000063', 'comment-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id in (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000063'
);

insert into public.bowls (id, name, owner_id, draw_method)
values
  (
    '10000000-0000-0000-0000-000000000061',
    'Comment Bowl',
    '00000000-0000-0000-0000-000000000061',
    'person_first'
  ),
  (
    '10000000-0000-0000-0000-000000000062',
    'Comment Rotation',
    '00000000-0000-0000-0000-000000000061',
    'rotation'
  );

insert into public.bowl_members (bowl_id, user_id, role)
select bowl_id, user_id, role
from (
  values
    ('10000000-0000-0000-0000-000000000061'::uuid, '00000000-0000-0000-0000-000000000061'::uuid, 'Owner'::text),
    ('10000000-0000-0000-0000-000000000061'::uuid, '00000000-0000-0000-0000-000000000062'::uuid, 'Member'::text),
    ('10000000-0000-0000-0000-000000000062'::uuid, '00000000-0000-0000-0000-000000000061'::uuid, 'Owner'::text),
    ('10000000-0000-0000-0000-000000000062'::uuid, '00000000-0000-0000-0000-000000000062'::uuid, 'Member'::text)
) membership(bowl_id, user_id, role);

insert into public.bowl_movies (
  id, bowl_id, added_by, tmdb_id, title, note
)
values
  (
    '20000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000061',
    '00000000-0000-0000-0000-000000000061',
    6101,
    'Owner Comment Movie',
    'Original note'
  ),
  (
    '20000000-0000-0000-0000-000000000062',
    '10000000-0000-0000-0000-000000000061',
    '00000000-0000-0000-0000-000000000062',
    6102,
    'Member Comment Movie',
    'Member note'
  ),
  (
    '20000000-0000-0000-0000-000000000063',
    '10000000-0000-0000-0000-000000000061',
    '00000000-0000-0000-0000-000000000061',
    6103,
    'Null Comment Movie',
    null
  ),
  (
    '20000000-0000-0000-0000-000000000064',
    '10000000-0000-0000-0000-000000000062',
    '00000000-0000-0000-0000-000000000062',
    6201,
    'Rotation Comment Movie',
    'Rotation snapshot note'
  );

insert into public.bowl_add_links (
  id, bowl_id, token, created_by, max_adds, adds_used, default_contributor_name
)
values
  (
    '30000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000061',
    'comment-link',
    '00000000-0000-0000-0000-000000000061',
    2,
    0,
    'Guest'
  ),
  (
    '30000000-0000-0000-0000-000000000062',
    '10000000-0000-0000-0000-000000000061',
    'comment-too-long-link',
    '00000000-0000-0000-0000-000000000061',
    2,
    0,
    'Guest'
  );

select has_column('public', 'bowl_movies', 'note', 'bowl movies have a note column');
select has_column('public', 'bowl_draw_events', 'note', 'draw events have a note column');
select has_column('public', 'user_watch_events', 'note', 'watch events have a note column');
select col_type_is('public', 'bowl_movies', 'note', 'text', 'bowl movie notes are text');
select col_type_is('public', 'bowl_draw_events', 'note', 'text', 'draw event notes are text');
select col_type_is('public', 'user_watch_events', 'note', 'text', 'watch event notes are text');

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_own_bowl_movie_note(uuid,text)',
    'EXECUTE'
  ),
  'authenticated users can call the narrow bowl comment RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_own_bowl_movie_note(uuid,text)',
    'EXECUTE'
  ),
  'anonymous users cannot call the bowl comment update RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","email":"comment-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);

select lives_ok(
  $sql$
    select public.update_own_bowl_movie_note(
      '20000000-0000-0000-0000-000000000061',
      E'  Dinner recommendation\nfrom Tim.  '
    )
  $sql$,
  'a contributor can update their own undrawn comment'
);

select is(
  (
    select note
    from public.bowl_movies
    where id = '20000000-0000-0000-0000-000000000061'
  ),
  E'Dinner recommendation\nfrom Tim.',
  'the bowl comment RPC trims edges and preserves internal line breaks'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000062","email":"comment-member@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', true);

select throws_ok(
  $sql$
    select public.update_own_bowl_movie_note(
      '20000000-0000-0000-0000-000000000061',
      'Not mine'
    )
  $sql$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'another member cannot edit the contributor comment'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","email":"comment-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);

select lives_ok(
  $sql$
    select public.draw_bowl_movie('20000000-0000-0000-0000-000000000061')
  $sql$,
  'an ordinary draw records a commented movie'
);

select is(
  (
    select note
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000061'
  ),
  E'Dinner recommendation\nfrom Tim.',
  'the shared draw event receives the comment snapshot'
);

select is(
  (
    select count(*)::integer
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000061'
      and history.note = E'Dinner recommendation\nfrom Tim.'
  ),
  2,
  'every participant receives the same personal comment snapshot'
);

select throws_ok(
  $sql$
    select public.update_own_bowl_movie_note(
      '20000000-0000-0000-0000-000000000061',
      'Too late'
    )
  $sql$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'the contributor cannot edit a comment after the draw'
);

select lives_ok(
  $sql$
    select public.return_bowl_draw_to_bowl(
      (
        select id
        from public.bowl_draw_events
        where source_bowl_movie_id = '20000000-0000-0000-0000-000000000061'
      )
    )
  $sql$,
  'a commented draw can be returned to the bowl'
);

select is(
  (
    select note
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and tmdb_id = 6101
      and drawn_at is null
  ),
  E'Dinner recommendation\nfrom Tim.',
  'returning a draw restores its original comment'
);

select lives_ok(
  $sql$
    select public.create_manual_watch_event(
      p_title => 'Manual Comment Movie',
      p_watched_on => '2026-08-22',
      p_note => '  My manual note.  '
    )
  $sql$,
  'a signed-in user can create manual history with a comment'
);

select is(
  (
    select note
    from public.user_watch_events
    where title = 'Manual Comment Movie'
  ),
  'My manual note.',
  'manual history creation normalizes the comment'
);

select lives_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (
        select id from public.user_watch_events where title = 'Manual Comment Movie'
      ),
      p_title => 'Manual Comment Movie',
      p_watched_on => '2026-08-22',
      p_release_date => null,
      p_note => 'Updated manual note'
    )
  $sql$,
  'the owner can update a manual history comment'
);

select is(
  (select note from public.user_watch_events where title = 'Manual Comment Movie'),
  'Updated manual note',
  'the manual history comment update is persisted'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000063","email":"comment-outsider@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000063', true);

select throws_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (
        select id from public.user_watch_events where title = 'Manual Comment Movie'
      ),
      p_title => 'Stolen edit',
      p_watched_on => '2026-08-22',
      p_note => 'Stolen note'
    )
  $sql$,
  'P0001',
  'This history entry is no longer available.',
  'another user cannot edit personal manual history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","email":"comment-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);

select lives_ok(
  $sql$
    select *
    from public.draw_bowl_movie_by_rotation(
      '10000000-0000-0000-0000-000000000062',
      array['20000000-0000-0000-0000-000000000064'::uuid]
    )
  $sql$,
  'rotation draw uses the shared comment persistence helper'
);

select is(
  (
    select note
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000064'
  ),
  'Rotation snapshot note',
  'a rotation draw stores the shared comment snapshot'
);

select lives_ok(
  $sql$
    select public.update_user_watch_event(
      p_event_id => (
        select history.id
        from public.user_watch_events history
        join public.bowl_draw_events event on event.id = history.source_draw_event_id
        where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000064'
          and history.user_id = '00000000-0000-0000-0000-000000000061'
      ),
      p_title => 'Rotation Comment Movie',
      p_watched_on => '2026-08-22',
      p_note => 'Attempted overwrite'
    )
  $sql$,
  'personal metadata on a bowl-draw history entry remains editable'
);

select is(
  (
    select history.note
    from public.user_watch_events history
    join public.bowl_draw_events event on event.id = history.source_draw_event_id
    where event.source_bowl_movie_id = '20000000-0000-0000-0000-000000000064'
      and history.user_id = '00000000-0000-0000-0000-000000000061'
  ),
  'Rotation snapshot note',
  'the update RPC ignores a bowl-draw comment overwrite'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $sql$
    select *
    from public.consume_bowl_add_link(
      'comment-link',
      jsonb_build_object(
        'tmdb_id', 6199,
        'title', 'Guest Comment Movie',
        'note', '  Guest recommendation.  '
      ),
      'Guest'
    )
  $sql$,
  'a public add link accepts a comment'
);

reset role;

select is(
  (
    select added_by
    from public.bowl_movies
    where title = 'Guest Comment Movie'
  ),
  null::uuid,
  'a link-created commented slip has no authenticated owner'
);

select is(
  (select note from public.bowl_movies where title = 'Guest Comment Movie'),
  'Guest recommendation.',
  'the public-link RPC normalizes and stores its comment'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","email":"comment-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);

select throws_ok(
  $sql$
    select public.update_own_bowl_movie_note(
      (select id from public.bowl_movies where title = 'Guest Comment Movie'),
      'Claimed by link creator'
    )
  $sql$,
  'P0001',
  'This movie comment is no longer available to edit.',
  'the link creator has no post-submit guest edit path'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $sql$
    select *
    from public.consume_bowl_add_link(
      'comment-too-long-link',
      jsonb_build_object('title', 'Too Long', 'note', repeat('x', 501)),
      'Guest'
    )
  $sql$,
  '22001',
  'Comment must be 500 characters or fewer.',
  'the public-link RPC rejects an over-limit comment'
);

reset role;

select is(
  (select adds_used from public.bowl_add_links where token = 'comment-too-long-link'),
  0,
  'an invalid public comment does not consume an add'
);

select throws_ok(
  $sql$
    insert into public.bowl_movies (
      bowl_id, added_by, tmdb_id, title, note
    ) values (
      '10000000-0000-0000-0000-000000000061',
      '00000000-0000-0000-0000-000000000061',
      6198,
      'Direct Too Long',
      repeat('x', 501)
    )
  $sql$,
  '23514',
  null,
  'the table check blocks an over-limit direct insert'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000061","email":"comment-owner@example.com","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', true);

select lives_ok(
  $sql$
    select public.update_own_bowl_movie_note(
      (
        select id
        from public.bowl_movies
        where bowl_id = '10000000-0000-0000-0000-000000000061'
          and tmdb_id = 6101
          and drawn_at is null
      ),
      E' \n '
    )
  $sql$,
  'a blank authenticated comment update succeeds'
);

select is(
  (
    select note
    from public.bowl_movies
    where bowl_id = '10000000-0000-0000-0000-000000000061'
      and tmdb_id = 6101
      and drawn_at is null
  ),
  null::text,
  'a blank authenticated comment is stored as null'
);

select lives_ok(
  $sql$
    select public.draw_bowl_movie('20000000-0000-0000-0000-000000000063')
  $sql$,
  'an existing null-comment movie remains drawable'
);

select is(
  (
    select note
    from public.bowl_draw_events
    where source_bowl_movie_id = '20000000-0000-0000-0000-000000000063'
  ),
  null::text,
  'drawing a null-comment movie stores a null snapshot'
);

select is(
  to_regprocedure(
    'public.create_manual_watch_event(text,date,bigint,text,date,integer,text[],text)'
  ),
  null::regprocedure,
  'the superseded manual-create signature is removed'
);

select is(
  to_regprocedure('public.update_user_watch_event(uuid,text,date,date)'),
  null::regprocedure,
  'the superseded history-update signature is removed'
);

select * from finish();
rollback;

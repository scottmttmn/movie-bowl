begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000001101', 'sharer@example.com'),
  ('00000000-0000-0000-0000-000000001102', 'someone-else@example.com');

insert into public.profiles (id, email, display_name)
values
  ('00000000-0000-0000-0000-000000001101', 'sharer@example.com', 'Scott'),
  ('00000000-0000-0000-0000-000000001102', 'someone-else@example.com', 'Robin');

insert into public.user_watch_events (user_id, source_kind, bowl_name, tmdb_id, title, poster_path, release_date, watched_on, note, personal_note, created_at)
values
  ('00000000-0000-0000-0000-000000001101', 'manual', null, 655, 'Paris, Texas', '/paris.jpg', '1984-05-19', '2026-11-08', null, 'The phone booth scene.', '2026-11-08 22:00+00'),
  ('00000000-0000-0000-0000-000000001101', 'bowl_draw', 'Friday Night', 11046, 'Local Hero', '/hero.jpg', '1983-02-17', '2026-11-06', 'Casey swears by it.', null, '2026-11-06 22:00+00'),
  ('00000000-0000-0000-0000-000000001101', 'manual', null, -5, 'Something with Adam Sandler', null, null, '2026-10-01', null, null, '2026-10-01 22:00+00'),
  ('00000000-0000-0000-0000-000000001102', 'manual', null, 1891, 'Robin''s Private Pick', null, null, '2026-11-07', null, 'Not for Scott''s viewers.', '2026-11-07 22:00+00');

-- The table is sealed ----------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.watch_history_share_links'::regclass),
  'share links have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.watch_history_share_links', 'SELECT')
    and not has_table_privilege('authenticated', 'public.watch_history_share_links', 'SELECT')
    and not has_table_privilege('authenticated', 'public.watch_history_share_links', 'INSERT')
    and not has_table_privilege('authenticated', 'public.watch_history_share_links', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.watch_history_share_links', 'DELETE')
    and not has_table_privilege('service_role', 'public.watch_history_share_links', 'SELECT'),
  'no API role reaches the token rows directly'
);

select ok(
  not has_function_privilege('anon', 'public.get_my_watch_history_share_link()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.save_my_watch_history_share_link(boolean)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.delete_my_watch_history_share_link()', 'EXECUTE'),
  'anonymous visitors cannot read, make or remove anyone''s link'
);

select ok(
  has_function_privilege('authenticated', 'public.get_my_watch_history_share_link()', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.save_my_watch_history_share_link(boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.delete_my_watch_history_share_link()', 'EXECUTE'),
  'signed-in people manage their own link'
);

select ok(
  has_function_privilege('anon', 'public.get_shared_watch_history(text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_shared_watch_history(text)', 'EXECUTE'),
  'anyone holding a link can read through it, signed in or not'
);

-- The owner makes a link -------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);

select is(public.get_my_watch_history_share_link(), null::jsonb, 'nobody has a link until they make one');

select is(
  (public.save_my_watch_history_share_link(false))->>'include_comments',
  'false',
  'a new link keeps comments private unless asked'
);

create temporary table first_link on commit drop as
select public.get_my_watch_history_share_link()->>'token' as token;
grant select on first_link to anon;

select ok(
  (select char_length(token) >= 32 from first_link),
  'the token is long enough not to be guessed'
);

select is(
  (public.save_my_watch_history_share_link(true))->>'token',
  (select token from first_link),
  'changing the comments setting keeps the link that was already sent'
);

select is(
  (public.get_my_watch_history_share_link())->>'include_comments',
  'true',
  'the comments setting is saved'
);

-- Someone else ------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);

select is(public.get_my_watch_history_share_link(), null::jsonb, 'another account never sees someone else''s link');

select lives_ok(
  $$select public.delete_my_watch_history_share_link()$$,
  'turning off one''s own (missing) link is harmless'
);

-- A viewer with the link ------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.save_my_watch_history_share_link(false)$$,
  '42501',
  null,
  'an anonymous visitor cannot make a link'
);

create temporary table shared on commit drop as
select public.get_shared_watch_history((select token from first_link)) as body;

select is((select body->>'display_name' from shared), 'Scott', 'the page is named for its owner');

select is(
  (select jsonb_array_length(body->'entries') from shared),
  3,
  'every entry of the owner''s history is shared, and only theirs'
);

select is(
  (select array_agg(entry->>'title' order by ordinality) from shared, jsonb_array_elements(body->'entries') with ordinality as e(entry, ordinality)),
  array['Paris, Texas', 'Local Hero', 'Something with Adam Sandler'],
  'entries come newest first, as on Watch History'
);

select is(
  (select array_agg(distinct key order by key) from shared, jsonb_array_elements(body->'entries') entry, jsonb_object_keys(entry) key),
  array['personal_note', 'poster_path', 'release_date', 'title', 'tmdb_id', 'watched_on'],
  'a viewer never gets a bowl name, a slip reason, or an entry id'
);

select is(
  (select body->'entries'->0->>'personal_note' from shared),
  'The phone booth scene.',
  'the owner''s own comment shows when they turned comments on'
);

select is(
  (select body->'entries'->0->>'watched_on' from shared),
  '2026-11-08',
  'the day watched is shared'
);

-- Comments off, link off -------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
select public.save_my_watch_history_share_link(false);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select ok(
  (select bool_and(entry->'personal_note' = 'null'::jsonb)
   from jsonb_array_elements(public.get_shared_watch_history((select token from first_link))->'entries') entry),
  'with comments off, no comment leaves the database'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
select public.delete_my_watch_history_share_link();

select isnt(
  (public.save_my_watch_history_share_link(false))->>'token',
  (select token from first_link),
  'a link made after turning one off is a new link'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(
  public.get_shared_watch_history((select token from first_link)),
  null::jsonb,
  'a turned-off link shows nothing'
);

select is(public.get_shared_watch_history('not-a-real-token-at-all-0000000000'), null::jsonb, 'an unknown token shows nothing');

select is(public.get_shared_watch_history(null), null::jsonb, 'a missing token shows nothing');

reset role;

select * from finish();
rollback;

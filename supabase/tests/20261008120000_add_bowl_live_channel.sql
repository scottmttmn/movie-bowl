begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000a01', 'live-owner@example.com'),
  ('00000000-0000-0000-0000-000000000a02', 'live-member@example.com'),
  ('00000000-0000-0000-0000-000000000a03', 'live-watcher@example.com'),
  ('00000000-0000-0000-0000-000000000a04', 'live-outsider@example.com');

insert into public.profiles (id, email)
select id, email
from auth.users
where id::text like '00000000-0000-0000-0000-000000000a0%';

-- The watcher is a member the owner has not allowed to draw.
insert into public.bowls (id, name, owner_id, draw_access_mode)
values ('10000000-0000-0000-0000-000000000a01', 'Live Night', '00000000-0000-0000-0000-000000000a01', 'selected_members');

insert into public.bowl_members (bowl_id, user_id, role)
values
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a01', 'Owner'),
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02', 'Member'),
  ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a03', 'Member');

insert into public.bowl_draw_permissions (bowl_id, user_id)
values ('10000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a02');

insert into realtime.messages (topic, extension, event, payload)
values
  ('bowl-live:10000000-0000-0000-0000-000000000a01', 'broadcast', 'draw', '{}'::jsonb),
  ('bowl-live:10000000-0000-0000-0000-000000000a01', 'presence', 'presence', '{}'::jsonb);

-- Shape

select ok(
  (select prosecdef and proconfig = array['search_path=public']
   from pg_proc
   where oid = 'public.can_use_bowl_live_channel(text,text,boolean)'::regprocedure),
  'the channel check is security definer with a fixed search path'
);
select ok(
  not has_function_privilege('anon', 'public.can_use_bowl_live_channel(text,text,boolean)', 'EXECUTE'),
  'anonymous callers cannot run the channel check'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and policyname like '%their bowl''s live channel'
     and roles = array['authenticated']::name[]),
  2,
  'both live channel policies are for signed-in callers only'
);

-- Members of the bowl

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', true);
select set_config('realtime.topic', 'bowl-live:10000000-0000-0000-0000-000000000a01', true);

select is(
  (select count(*)::int from realtime.messages),
  2,
  'a member who can draw receives the bowl''s broadcasts and presence'
);
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'broadcast', 'draw', '{}'::jsonb) $$,
  'a member who can draw may announce a draw'
);
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'presence', 'presence', '{}'::jsonb) $$,
  'a member may say they are present'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a03","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a03', true);

select ok(
  (select count(*) from realtime.messages) >= 2,
  'a member who cannot draw still receives the channel'
);
select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'presence', 'presence', '{}'::jsonb) $$,
  'a member who cannot draw may still say they are present, as a television does'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'broadcast', 'draw', '{}'::jsonb) $$,
  '42501',
  null,
  'a member who cannot draw cannot announce a draw'
);

-- The owner

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);

select lives_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'broadcast', 'draw', '{}'::jsonb) $$,
  'the owner may announce a draw whatever the draw access'
);

-- Outside the bowl

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a04","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a04', true);

select is(
  (select count(*)::int from realtime.messages),
  0,
  'an outsider receives nothing on the bowl''s channel'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'presence', 'presence', '{}'::jsonb) $$,
  '42501',
  null,
  'an outsider cannot appear on the bowl''s channel'
);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, event, payload)
     values ('bowl-live:10000000-0000-0000-0000-000000000a01', 'broadcast', 'draw', '{}'::jsonb) $$,
  '42501',
  null,
  'an outsider cannot announce a draw'
);

-- Topics that are not a bowl's live channel

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);

select ok(
  not public.can_use_bowl_live_channel('bowl-live:not-a-uuid', 'broadcast', false),
  'a malformed topic is refused rather than raising'
);
select ok(
  not public.can_use_bowl_live_channel('bowl:10000000-0000-0000-0000-000000000a01', 'broadcast', false),
  'only the bowl-live prefix names a bowl'
);
select ok(
  not public.can_use_bowl_live_channel('bowl-live:10000000-0000-0000-0000-000000000a01', 'postgres_changes', false),
  'the channel carries broadcast and presence only'
);
reset role;

set local role anon;
select throws_ok(
  $$ select count(*) from realtime.messages
     where topic = 'bowl-live:10000000-0000-0000-0000-000000000a01'
       and public.can_use_bowl_live_channel(topic, extension, false) $$,
  '42501',
  null,
  'an anonymous caller cannot even ask'
);
reset role;

select * from finish();
rollback;

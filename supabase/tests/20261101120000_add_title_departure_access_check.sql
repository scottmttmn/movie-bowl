begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

select ok(not has_function_privilege(role_name, 'public.can_fetch_title_departure(bigint,uuid,uuid)', 'EXECUTE'),
  role_name || ' cannot run the departure access check')
from (values ('anon'), ('authenticated'), ('public')) roles(role_name);
select ok(has_function_privilege('service_role', 'public.can_fetch_title_departure(bigint,uuid,uuid)', 'EXECUTE'),
  'the lookup route may run the departure access check');
select is((select prosecdef from pg_proc where oid = 'public.can_fetch_title_departure(bigint,uuid,uuid)'::regprocedure),
  false, 'the check runs with the caller''s rights, not its owner''s');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000091', 'departure-access-owner@example.com'),
  ('00000000-0000-4000-8000-000000000092', 'departure-access-member@example.com'),
  ('00000000-0000-4000-8000-000000000093', 'departure-access-outsider@example.com'),
  ('00000000-0000-4000-8000-000000000094', 'departure-access-no-services@example.com'),
  ('00000000-0000-4000-8000-000000000095', 'departure-access-other-owner@example.com');
insert into public.profiles (id, email, streaming_services)
select id, email, case when email like '%no-services%' then '{}'::text[] else array['Netflix'] end
from auth.users where email like 'departure-access-%@example.com';
insert into public.bowls (id, name, owner_id) values
  ('00000000-0000-4000-8000-000000000090', 'Departure access', '00000000-0000-4000-8000-000000000091'),
  ('00000000-0000-4000-8000-000000000096', 'Someone else''s bowl', '00000000-0000-4000-8000-000000000095');
insert into public.bowl_members (bowl_id, user_id) values
  ('00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000092'),
  ('00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000094');
insert into public.bowl_movies (bowl_id, added_by, tmdb_id, title) values
  ('00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091', 501, 'Active'),
  ('00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091', 502, 'Drawn'),
  ('00000000-0000-4000-8000-000000000096', '00000000-0000-4000-8000-000000000095', 503, 'Elsewhere');
update public.bowl_movies set drawn_at = now() where tmdb_id = 502;

set local role service_role;
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  true, 'the owner may look up an active title');
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000092'),
  true, 'a member may look up an active title');
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000093'),
  false, 'an outsider may not look up another bowl''s title');
select is(can_fetch_title_departure(503, '00000000-0000-4000-8000-000000000096', '00000000-0000-4000-8000-000000000091'),
  false, 'owning one bowl does not open another');
select is(can_fetch_title_departure(503, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'a title from another bowl does not count in yours');
select is(can_fetch_title_departure(999999, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'an arbitrary movie id is not in the bowl');
select is(can_fetch_title_departure(502, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'a drawn title is no longer active');
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-0000000000ff', '00000000-0000-4000-8000-000000000091'),
  false, 'a bowl that does not exist is refused');
select is(can_fetch_title_departure(501, null, '00000000-0000-4000-8000-000000000091'),
  false, 'omitting the bowl is refused');
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', null),
  false, 'omitting the user is refused');
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000094'),
  false, 'a member with no saved services is refused');
select is(can_fetch_title_departure(-501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'a custom title is refused');
select is(can_fetch_title_departure(null, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'a missing title is refused');
reset role;

-- Access is read live: losing it between two lookups is seen by the second.
delete from public.bowl_members
where bowl_id = '00000000-0000-4000-8000-000000000090' and user_id = '00000000-0000-4000-8000-000000000092';
set local role service_role;
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000092'),
  false, 'a removed member is refused');
reset role;
update public.bowl_movies set drawn_at = now() where tmdb_id = 501;
set local role service_role;
select is(can_fetch_title_departure(501, '00000000-0000-4000-8000-000000000090', '00000000-0000-4000-8000-000000000091'),
  false, 'a title drawn since is refused');
reset role;

-- The check agrees with the reservation it precedes, and spends nothing itself.
select is((select count(*)::integer from title_departure_usage), 0, 'the access check reserves no quota');
select is((select count(*)::integer from title_departures), 0, 'the access check takes no lease');

select * from finish();
rollback;

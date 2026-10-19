begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.title_departures'::regclass, 'public.title_departure_usage'::regclass
)), 'departure cache and usage have RLS');
select ok(not has_table_privilege(role_name, table_name, privilege), role_name || ' cannot ' || privilege || ' ' || table_name)
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values ('public.title_departures'), ('public.title_departure_usage')) tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) permissions(privilege);
select ok(not has_function_privilege(role_name, signature, 'EXECUTE'), role_name || ' cannot execute ' || signature)
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values ('public.begin_title_departure_fetch(bigint,uuid,integer)'),
  ('public.complete_title_departure_fetch(bigint,uuid,jsonb)'), ('public.fail_title_departure_fetch(bigint,uuid)'),
  ('public.prune_title_departures()')) functions(signature);
select ok(has_function_privilege('service_role', 'public.begin_title_departure_fetch(bigint,uuid,integer)', 'EXECUTE'), 'server may reserve a request');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000081', 'departures-one@example.com'),
  ('00000000-0000-4000-8000-000000000082', 'departures-two@example.com'),
  ('00000000-0000-4000-8000-000000000083', 'departures-empty@example.com');
insert into public.profiles (id, email, streaming_services)
select id, email, case when email = 'departures-empty@example.com' then '{}'::text[] else array['Netflix'] end
from auth.users where email like 'departures-%@example.com';

select throws_ok($$select begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000083', 900)$$,
  '42501', 'Departure lookup not allowed', 'no saved services cannot reserve a lookup');
select throws_ok($$select begin_title_departure_fetch(77, null, 900)$$,
  '42501', 'Departure lookup not allowed', 'no profile cannot reserve a lookup');
select throws_ok($$select begin_title_departure_fetch(-1, '00000000-0000-4000-8000-000000000081', 900)$$,
  '22023', 'Invalid departure lookup', 'custom titles cannot reserve');
select throws_ok($$select begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000081', 901)$$,
  '22023', 'Invalid departure lookup', 'budget cannot exceed the hard cap');

set local role service_role;
select is(begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000081', 2)->>'should_fetch', 'true', 'the service role can claim a cache miss');
reset role;
select is((select sum(request_count)::integer from title_departure_usage), 1, 'reservation counts before HTTP');
select is(begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000082', 2)->>'should_fetch', 'false', 'concurrent lookup does not duplicate the request');
select is(complete_title_departure_fetch(77, gen_random_uuid(), '[]'), null::timestamptz, 'wrong lease cannot complete another request');
set local role service_role;
select complete_title_departure_fetch(77, (select fetch_token from title_departures where tmdb_id = 77), '[{"service":"Netflix","expiresOn":null}]');
reset role;
select is(begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000082', 0)->'departures', '[{"service":"Netflix","expiresOn":null}]'::jsonb, 'a second user shares the fresh result even at zero budget');
select is((select valid_until - fetched_at from title_departures where tmdb_id = 77), interval '1 day', 'positive notices refresh daily');

select is(begin_title_departure_fetch(78, '00000000-0000-4000-8000-000000000082', 2)->>'should_fetch', 'true', 'a second movie spends the last request');
select fail_title_departure_fetch(78, (select fetch_token from title_departures where tmdb_id = 78));
select is(begin_title_departure_fetch(78, '00000000-0000-4000-8000-000000000082', 900)->>'should_fetch', 'false', 'failure backoff prevents retries');
select is(begin_title_departure_fetch(79, '00000000-0000-4000-8000-000000000081', 2)->>'should_fetch', 'false', 'budget is shared across users and titles');
update title_departures set valid_until = now() - interval '1 second' where tmdb_id = 77;
select is(begin_title_departure_fetch(77, '00000000-0000-4000-8000-000000000081', 2)->'departures', '[]'::jsonb, 'budget fallback hides stale notices');

update title_departures set retry_after = now() - interval '1 second' where tmdb_id = 78;
select begin_title_departure_fetch(78, '00000000-0000-4000-8000-000000000082', 900);
select complete_title_departure_fetch(78, (select fetch_token from title_departures where tmdb_id = 78), '[]');
select is((select valid_until - fetched_at from title_departures where tmdb_id = 78), interval '7 days', 'empty answers are cached for a week');
select is(begin_title_departure_fetch(78, '00000000-0000-4000-8000-000000000081', 0)->>'should_fetch', 'false', 'empty answers are shared');

update title_departure_usage set request_count = 30 where user_id = '00000000-0000-4000-8000-000000000081';
select is(begin_title_departure_fetch(80, '00000000-0000-4000-8000-000000000081', 900)->>'should_fetch', 'false', 'one user cannot exhaust the budget in a browsing session');
update title_departure_usage set usage_day = usage_day - 20;
select is(begin_title_departure_fetch(80, '00000000-0000-4000-8000-000000000081', 2)->>'should_fetch', 'false', 'usage before the current month still counts in the rolling budget');
update title_departure_usage set usage_day = usage_day - 20;
select is(begin_title_departure_fetch(80, '00000000-0000-4000-8000-000000000081', 2)->>'should_fetch', 'true', 'usage outside the rolling window no longer counts');
update title_departures set valid_until = now() - interval '8 days' where tmdb_id = 77;
select prune_title_departures();
select is((select count(*)::integer from title_departures where tmdb_id = 77), 0, 'old cache rows are pruned');
select is((select count(*)::integer from title_departure_usage where usage_day < (now() at time zone 'UTC')::date - 31), 0, 'old counters are pruned');

select * from finish();
rollback;

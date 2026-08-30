begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

select has_table('public', 'title_provider_links', 'the title cache exists');
select has_table('public', 'title_provider_link_usage', 'the budget counter exists');
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.title_provider_links'::regclass, 'public.title_provider_link_usage'::regclass
)), 'both tables have RLS');
select ok(not has_table_privilege(role_name, table_name, privilege), role_name || ' cannot ' || privilege || ' ' || table_name)
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values ('public.title_provider_links'), ('public.title_provider_link_usage')) tables(table_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) permissions(privilege);
select ok(not has_function_privilege(role_name, signature, 'EXECUTE'), role_name || ' cannot execute ' || signature)
from (values ('anon'), ('authenticated')) roles(role_name)
cross join (values
  ('public.begin_title_provider_link_fetch(bigint,text,uuid,uuid,integer)'),
  ('public.complete_title_provider_link_fetch(bigint,text,jsonb)'),
  ('public.fail_title_provider_link_fetch(bigint,text,text)'),
  ('public.prune_title_provider_links()')
) functions(signature);
select ok(has_function_privilege('service_role', 'public.begin_title_provider_link_fetch(bigint,text,uuid,uuid,integer)', 'EXECUTE'), 'service role can reserve a lookup');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000091', 'links-owner@example.com'),
  ('00000000-0000-4000-8000-000000000092', 'links-member@example.com'),
  ('00000000-0000-4000-8000-000000000093', 'links-outsider@example.com');
insert into public.profiles (id, email)
select id, email from auth.users where email like 'links-%@example.com';
insert into public.bowls (id, name, owner_id) values
  ('10000000-0000-4000-8000-000000000091', 'Provider Links Bowl', '00000000-0000-4000-8000-000000000091');
insert into public.bowl_members (bowl_id, user_id, role) values
  ('10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 'Member');
insert into public.bowl_movies (id, bowl_id, added_by, tmdb_id, title) values
  ('20000000-0000-4000-8000-000000000091', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000091', 9101, 'Link Movie'),
  ('20000000-0000-4000-8000-000000000092', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 9102, 'Empty Movie');

select is((select count(*)::integer from public.title_provider_links where tmdb_id in (9101, 9102)), 0, 'adds do not seed the cache via triggers');
select is(public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000091', 2)->>'should_fetch', 'true', 'an owner reserves a cache miss');
select is((select request_count from public.title_provider_link_usage where region = 'US' and usage_month = date_trunc('month', now() at time zone 'UTC')::date), 1, 'one request reserved before HTTP');
select public.complete_title_provider_link_fetch(9101, 'US', '[{"service":"Netflix","type":"sub","webUrl":"https://www.netflix.com/title/123"}]');
select is(public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 0)->>'should_fetch', 'false', 'a member gets the fresh cache even at zero budget');
select is(jsonb_array_length(public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 0)->'links'), 1, 'the member receives the cached title link');
select is((select request_count from public.title_provider_link_usage where region = 'US' and usage_month = date_trunc('month', now() at time zone 'UTC')::date), 1, 'cache reads spend nothing');

select throws_ok($$select public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000093', 2)$$, '42501', 'Provider lookup not allowed', 'an outsider cannot read a cached row');
select throws_ok($$select public.begin_title_provider_link_fetch(9991, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)$$, '42501', 'Provider lookup not allowed', 'membership alone does not authorize arbitrary titles');
select throws_ok($$select public.begin_title_provider_link_fetch(-1, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)$$, '22023', 'Invalid provider lookup', 'custom titles cannot create cache rows');
select throws_ok($$select public.begin_title_provider_link_fetch(9101, 'CA', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)$$, '22023', 'Invalid provider lookup', 'non-US lookups cannot create a second budget bucket');

update public.bowl_movies set drawn_at = now() where tmdb_id = 9101;
select is(jsonb_array_length(public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)->'links'), 1, 'drawing does not make the title inaccessible');
select is(public.begin_title_provider_link_fetch(9102, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)->>'should_fetch', 'true', 'a second title consumes the last request');
select public.fail_title_provider_link_fetch(9102, 'US', 'Watchmode request failed (429)');
select is((select consecutive_failures from public.title_provider_links where tmdb_id = 9102), 1, 'failure count survives requests');
select ok((select retry_after > now() from public.title_provider_links where tmdb_id = 9102), 'failure establishes a backoff');
select is(public.begin_title_provider_link_fetch(9102, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 10)->>'should_fetch', 'false', 'backoff refuses another fetch even with spare budget');
select is((select request_count from public.title_provider_link_usage where region = 'US' and usage_month = date_trunc('month', now() at time zone 'UTC')::date), 2, 'backoff does not increment usage');
update public.title_provider_links set retry_after = now() - interval '1 minute' where tmdb_id = 9102;
select is(public.begin_title_provider_link_fetch(9102, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)->>'should_fetch', 'false', 'the exhausted budget prevents an eligible retry');
select is((select request_count from public.title_provider_link_usage where region = 'US' and usage_month = date_trunc('month', now() at time zone 'UTC')::date), 2, 'budget cannot be overrun');

select public.complete_title_provider_link_fetch(9102, 'US', '[]');
select is(public.begin_title_provider_link_fetch(9102, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 10)->>'should_fetch', 'false', 'successful empty results are cached');
select ok((select consecutive_failures = 0 and retry_after is null and last_error is null from public.title_provider_links where tmdb_id = 9102), 'success clears failure state');
update public.title_provider_links set fetched_at = now() - interval '31 days' where tmdb_id = 9101;
select is(public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000092', 2)->'links', '[]'::jsonb, 'budget fallback never serves expired vendor data');
select is((select links from public.title_provider_links where tmdb_id = 9101), '[]'::jsonb, 'expired data is removed at lookup time');
update public.title_provider_links set fetched_at = now() - interval '29 days' where tmdb_id = 9102;
select public.prune_title_provider_links();
select is((select count(*)::integer from public.title_provider_links where tmdb_id = 9102), 0, 'the daily job deletes old vendor data without a vendor call');

set local role authenticated;
select throws_ok('select * from public.title_provider_links', '42501', 'permission denied for table title_provider_links', 'authenticated direct reads are denied');
select throws_ok($$select public.begin_title_provider_link_fetch(9101, 'US', '10000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000091', 2)$$, '42501', 'permission denied for function begin_title_provider_link_fetch', 'clients cannot spoof the RPC user argument');
reset role;
select * from finish();
rollback;

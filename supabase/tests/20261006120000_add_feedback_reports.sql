begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000901', 'sender@example.com'),
  ('00000000-0000-0000-0000-000000000902', 'other@example.com');

insert into public.profiles (id, email)
values
  ('00000000-0000-0000-0000-000000000901', 'sender@example.com'),
  ('00000000-0000-0000-0000-000000000902', 'other@example.com');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.feedback_reports'::regclass),
  'feedback reports have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.feedback_reports', 'SELECT')
    and not has_table_privilege('anon', 'public.feedback_reports', 'INSERT')
    and not has_table_privilege('anon', 'public.feedback_reports', 'UPDATE')
    and not has_table_privilege('anon', 'public.feedback_reports', 'DELETE'),
  'anonymous clients cannot reach feedback reports'
);

select ok(
  not has_table_privilege('authenticated', 'public.feedback_reports', 'SELECT')
    and not has_table_privilege('authenticated', 'public.feedback_reports', 'INSERT')
    and not has_table_privilege('authenticated', 'public.feedback_reports', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.feedback_reports', 'DELETE'),
  'signed-in clients cannot read anyone''s reports, their own included'
);

select ok(
  not has_table_privilege('service_role', 'public.feedback_reports', 'SELECT')
    and not has_table_privilege('service_role', 'public.feedback_reports', 'DELETE'),
  'the service role only records reports, through the function'
);

select ok(
  not has_function_privilege('anon', 'public.record_feedback_report(uuid,text,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_feedback_report(uuid,text,text,text,text,text)', 'EXECUTE'),
  'clients cannot record a report as someone else'
);

select ok(
  has_function_privilege('service_role', 'public.record_feedback_report(uuid,text,text,text,text,text)', 'EXECUTE'),
  'the service role can record reports'
);

select is(
  (public.record_feedback_report(
    '00000000-0000-0000-0000-000000000901', 'The draw did nothing', null, '/bowl/x', 'Pixel 8', 'abc123'
  ))->>'ok',
  'true',
  'a written report is recorded'
);

select is(
  (public.record_feedback_report(
    '00000000-0000-0000-0000-000000000901', '', 'TypeError: boom', '/bowl/x', null, null
  ))->>'ok',
  'true',
  'an error report may arrive without a message'
);

select throws_ok(
  $$select public.record_feedback_report('00000000-0000-0000-0000-000000000901', '   ', null)$$,
  '23514',
  null,
  'a report with neither a message nor an error is refused'
);

select throws_ok(
  $$select public.record_feedback_report('00000000-0000-0000-0000-000000000901', repeat('x', 4001))$$,
  '23514',
  null,
  'an overlong message is refused'
);

select is(
  (select error_text from public.feedback_reports where message = 'The draw did nothing'),
  null,
  'a missing error is stored as null'
);

-- Eight more reach the hourly limit of ten; the eleventh is refused.
select public.record_feedback_report('00000000-0000-0000-0000-000000000901', 'again ' || n)
from generate_series(1, 8) as n;

select is(
  (public.record_feedback_report('00000000-0000-0000-0000-000000000901', 'one too many'))->>'code',
  'rate_limited',
  'an eleventh report inside an hour is refused'
);

select is(
  (public.record_feedback_report('00000000-0000-0000-0000-000000000902', 'mine'))->>'ok',
  'true',
  'one sender''s limit does not hold back another'
);

delete from auth.users where id = '00000000-0000-0000-0000-000000000901';

select is(
  (select count(*) from public.feedback_reports where user_id = '00000000-0000-0000-0000-000000000901'),
  0::bigint,
  'deleting the account deletes its reports'
);

select * from finish();

rollback;

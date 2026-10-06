-- What people send from the app's "Send feedback" sheet and the error screen's
-- "Send report". The serverless route mails each one to Scott; this table is
-- the record, so a report survives a mail outage and can be read back later.
--
-- A report belongs to its sender's account and goes when the account does.
-- The context columns hold only what the sheet tells the sender it sends --
-- the page and the device -- plus the build and, from the error screen, the
-- error they were shown.
begin;

create table public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 4000),
  error_text text check (char_length(error_text) <= 2000),
  page text check (char_length(page) <= 300),
  device text check (char_length(device) <= 400),
  build text check (char_length(build) <= 80),
  created_at timestamptz not null default now(),
  -- A report with nothing in it is not a report. The error screen may send
  -- the error alone; everywhere else the sender has to have written something.
  check (char_length(btrim(message)) > 0 or char_length(btrim(coalesce(error_text, ''))) > 0)
);

create index feedback_reports_user_recent_idx
  on public.feedback_reports (user_id, created_at desc);

alter table public.feedback_reports enable row level security;

-- No role reads or writes this table directly. Reports arrive through
-- record_feedback_report, and reading them is Scott in the SQL editor.
revoke all on table public.feedback_reports from public, anon, authenticated, service_role;

-- Saves one report for an already-authenticated user, or refuses with a code.
-- The limit is a floor under a stuck retry loop or a bored friend, not a
-- defence against a determined sender: ten in an hour is far past anyone
-- telling us something.
create function public.record_feedback_report(
  p_user_id uuid,
  p_message text,
  p_error_text text default null,
  p_page text default null,
  p_device text default null,
  p_build text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
  new_id uuid;
begin
  -- Serialize one sender's reports so two at once cannot both slip under the
  -- limit.
  perform pg_advisory_xact_lock(hashtextextended('feedback:' || p_user_id::text, 0));

  select count(*) into recent
  from public.feedback_reports
  where user_id = p_user_id
    and created_at > now() - interval '1 hour';

  if recent >= 10 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  insert into public.feedback_reports (user_id, message, error_text, page, device, build)
  values (
    p_user_id,
    coalesce(p_message, ''),
    nullif(btrim(coalesce(p_error_text, '')), ''),
    nullif(btrim(coalesce(p_page, '')), ''),
    nullif(btrim(coalesce(p_device, '')), ''),
    nullif(btrim(coalesce(p_build, '')), '')
  )
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id);
end;
$$;

revoke all on function public.record_feedback_report(uuid, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.record_feedback_report(uuid, text, text, text, text, text) to service_role;

comment on table public.feedback_reports is
  'Feedback and error reports sent from the app. No role reaches it directly; writes go through record_feedback_report.';
comment on function public.record_feedback_report(uuid, text, text, text, text, text) is
  'Saves one feedback report for an authenticated user; refuses past ten in an hour.';

commit;

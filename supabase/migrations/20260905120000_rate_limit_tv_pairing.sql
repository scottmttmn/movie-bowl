begin;

create table public.tv_pairing_rate_limits (
  bucket text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  attempts integer not null,
  updated_at timestamptz not null,
  primary key (bucket, subject_hash),
  constraint tv_pairing_rate_limits_bucket_format
    check (bucket ~ '^[a-z][a-z0-9_]{2,31}$'),
  constraint tv_pairing_rate_limits_subject_hash_format
    check (subject_hash ~ '^[a-f0-9]{64}$'),
  constraint tv_pairing_rate_limits_attempts_positive
    check (attempts > 0)
);

create index tv_pairing_rate_limits_updated_at_idx
  on public.tv_pairing_rate_limits(updated_at);

alter table public.tv_pairing_rate_limits enable row level security;

revoke all on table public.tv_pairing_rate_limits
from public, anon, authenticated, service_role;

create function public.consume_tv_pairing_rate_limit(
  p_bucket text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_attempts integer;
  v_window_started_at timestamptz;
  v_retry_after_seconds integer;
begin
  if p_bucket is null
    or p_bucket !~ '^[a-z][a-z0-9_]{2,31}$'
    or p_subject_hash is null
    or p_subject_hash !~ '^[a-f0-9]{64}$'
    or p_limit is null
    or p_limit < 1
    or p_limit > 100000
    or p_window_seconds is null
    or p_window_seconds < 1
    or p_window_seconds > 86400
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid TV pairing rate limit parameters';
  end if;

  delete from public.tv_pairing_rate_limits
  where updated_at < v_now - interval '2 days';

  insert into public.tv_pairing_rate_limits (
    bucket,
    subject_hash,
    window_started_at,
    attempts,
    updated_at
  ) values (
    p_bucket,
    p_subject_hash,
    v_now,
    1,
    v_now
  )
  on conflict (bucket, subject_hash) do update
  set
    attempts = case
      when public.tv_pairing_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then 1
      else least(public.tv_pairing_rate_limits.attempts + 1, 100001)
    end,
    window_started_at = case
      when public.tv_pairing_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then v_now
      else public.tv_pairing_rate_limits.window_started_at
    end,
    updated_at = v_now
  returning attempts, window_started_at
  into v_attempts, v_window_started_at;

  if v_attempts <= p_limit then
    return jsonb_build_object(
      'allowed', true,
      'retry_after_seconds', 0
    );
  end if;

  v_retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (
      v_window_started_at
        + make_interval(secs => p_window_seconds)
        - v_now
    )))::integer
  );

  return jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', v_retry_after_seconds
  );
end;
$$;

revoke all on function public.consume_tv_pairing_rate_limit(text, text, integer, integer)
from public, anon, authenticated;

grant execute on function public.consume_tv_pairing_rate_limit(text, text, integer, integer)
to service_role;

comment on table public.tv_pairing_rate_limits is
  'Short-lived, server-only counters that bound TV pairing creation and approval attempts.';

comment on column public.tv_pairing_rate_limits.subject_hash is
  'HMAC-SHA256 pseudonym produced by the server; raw client addresses and user IDs are not stored.';

commit;

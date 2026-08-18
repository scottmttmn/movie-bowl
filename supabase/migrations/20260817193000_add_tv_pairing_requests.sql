begin;

create table public.tv_pairing_requests (
  id uuid primary key,
  user_code text not null unique,
  device_secret_hash text not null unique,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint tv_pairing_requests_user_code_format
    check (user_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  constraint tv_pairing_requests_device_secret_hash_format
    check (device_secret_hash ~ '^[a-f0-9]{64}$'),
  constraint tv_pairing_requests_expiration_window
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    ),
  constraint tv_pairing_requests_approval_consistency
    check (
      (approved_by is null and approved_at is null)
      or (approved_by is not null and approved_at is not null)
    ),
  constraint tv_pairing_requests_claim_consistency
    check (claimed_at is null or approved_at is not null)
);

create index tv_pairing_requests_expires_at_idx
  on public.tv_pairing_requests(expires_at);

alter table public.tv_pairing_requests enable row level security;

revoke all on table public.tv_pairing_requests
from public, anon, authenticated;

grant select, insert, update, delete on table public.tv_pairing_requests
to service_role;

comment on table public.tv_pairing_requests is
  'Short-lived, server-only requests used to pair a television with an authenticated Movie Bowl account.';

comment on column public.tv_pairing_requests.device_secret_hash is
  'SHA-256 hash of the high-entropy secret retained only by the requesting television.';

commit;

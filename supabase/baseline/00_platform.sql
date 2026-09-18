-- The parts of a Supabase database that are not this project's to define: the
-- roles PostgREST connects as, the `auth` schema GoTrue owns, and the
-- `extensions` schema Supabase installs into. Hosted Supabase creates all of
-- this before the first migration runs, so no migration here does -- which
-- means a plain Postgres has to be given it before the schema will apply.
--
-- This is deliberately the smallest shim the migrations and the pgTAP suites
-- actually touch, not an imitation of Supabase. `auth.users` carries the two
-- columns this project reads and the cascade behaviour it depends on; the
-- claim readers below are Supabase's own definitions, because the suites drive
-- them exactly the way PostgREST does.

create schema if not exists extensions;
create schema if not exists auth;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login;
  end if;
end;
$$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase grants anon, authenticated and service_role by default privilege, so
-- an object created later is born with those grants unless a migration revokes
-- them by name. The suites assert exactly that distinction, so the defaults
-- have to be here rather than assumed.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table auth.users enable row level security;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid(), auth.email(), auth.role(), auth.jwt()
  to anon, authenticated, service_role;

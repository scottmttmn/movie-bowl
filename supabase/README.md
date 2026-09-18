# Supabase Migrations

This directory is the source of truth for Movie Bowl database schema and RLS policy changes.

## One-time setup

1. Install the Supabase CLI.
2. Link this repo to your existing Supabase project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

You do not need step 2 to run the tests. `supabase/baseline/` already carries
the schema as it stood before the first migration, so the suites build their own
database from this repository; linking is only for `supabase db push`.

## Ongoing workflow

1. Create a new migration:

```bash
supabase migration new short_description
```

2. Add SQL changes (tables, constraints, indexes, RLS, policies).
3. Apply to remote:

```bash
supabase db push
```

4. Commit migration files to git.

## Local pgTAP verification

```bash
./scripts/pgtap.sh                            # every suite
./scripts/pgtap.sh supabase/tests/20260904120000_*.sql   # one suite
```

The script creates a scratch database on a PostgreSQL you already have, applies
`baseline/` and then every file in `migrations/` in order, runs the suites and
drops the database again — on failure too. It never touches the hosted database:
pgTAP writes rows.

You need pgTAP and `pg_prove` installed beside that server:

```bash
sudo apt-get install pgtap     # Debian/Ubuntu
brew install postgresql@16 pgtap   # macOS
```

Set `DATABASE_URL` to a superuser connection if the server is not
`postgres://postgres@localhost:5432/postgres`. The same script is what
`.github/workflows/ci.yml` runs, against a PostgreSQL that exists for the length
of the job.

A clean run is **23 suites / 600 assertions, all passing**. If yours is not
green, that is your change. `npm run test:counts -- pgtap` holds those numbers
to the sentence in `CLAUDE.md`.

## The baseline

Movie Bowl's first tables were made in the Supabase dashboard, so `migrations/`
opens in March 2026 on a database that already had `profiles`, `bowls`,
`bowl_members`, `bowl_movies`, `bowl_invites` and `bowl_draw_permissions`. For a
long time the only way to get them was `supabase db dump` against the linked
project, which meant the suites could run only where a production credential
could go — not in a public repository's CI.

`baseline/` closes that gap. `00_platform.sql` is the part of a Supabase
database that is not this project's to define: the `anon`, `authenticated` and
`service_role` roles, the `auth` schema with the claim readers PostgREST sets,
and the default privileges Supabase grants in `public`. `01_schema.sql` is the
pre-migration schema itself. Baseline plus migrations is the whole schema.

It is deliberately **not** in `migrations/`, for the same reason `rollback/` is
not: `supabase db push` would try to apply it to a database that has had those
objects since before the ledger existed. Nothing in `baseline/` is ever pushed.

New schema is a migration. The baseline moves only if the pre-March-2026 schema
turns out to have been described wrongly.

### What holds the baseline honest

It is a reconstruction, not a dump. What keeps it true is the suites: 600
assertions over policies, grants, RPC behaviour and the tables the baseline
defines, and they pass against it exactly as they passed against a dump of
production. A column the suites never read could still be wrong.

To confirm it against the real thing, from a linked checkout:

```bash
supabase db dump --schema public -f /tmp/deployed.sql
./scripts/pgtap.sh                                 # leaves nothing behind
```

and dump the scratch database the same way before it is dropped. Expect
cosmetic differences — statement order, ownership, the `IF NOT EXISTS` clauses
the baseline uses — and read the diff for missing columns, constraints and
policies rather than for equality. Do this when a migration surprises you, not
routinely.

### Privileges

Supabase grants `anon`, `authenticated` and `service_role` in `public` by
default privilege, and several migrations revoke those grants by name. The
baseline sets the same default privileges, so an object created by a migration
is born with the same grants it is born with in production and a migration's
`revoke ... from public, anon, authenticated` means the same thing here.

This replaced a much more delicate arrangement. When the suites were seeded from
`pg_dump`, the dump wrote the ACL it wanted each object to *end up* with,
assuming a target starting from Postgres defaults — which a Supabase database is
not. The old script had to clear the default privileges before restoring, or the
suite reported about 70 phantom privilege failures and could never go green.
None of that applies to a database built from the repository.

## Drift rule

Avoid dashboard-only schema/policy changes. If an emergency dashboard edit happens, immediately backfill it into a migration file and commit.

## Legacy queue table note

`public.bowl_movie_queue` remains for compatibility with older migrations and rows, but active app code no longer writes to it.
The equal-probability contributor draw migration promotes pending queue rows into `public.bowl_movies`.

## Private profile identity and account deletion

`20260917212637_add_private_profiles_and_account_deletion.sql` adds optional,
non-unique `profiles.display_name` values and changes the two scoped identity
directories to return display names instead of email addresses. It also adds
the authenticated `transfer_owned_bowl` RPC and the service-role-only
`delete_account_data_for_user` cleanup RPC. The trusted API performs cleanup,
then hard-deletes the Supabase Auth user; users who still own bowls receive a
blocker list and must transfer or delete those bowls first.

Deletion removes personal and authorization data while retaining anonymized
completed bowl history. The matching pgTAP suite has 16 assertions and runs on
the scratch database with:

```bash
./scripts/pgtap.sh supabase/tests/20260917212637_add_private_profiles_and_account_deletion.sql
```

Rollback is in
`rollback/20260917212637_remove_private_profiles_and_account_deletion.sql`.
Revert the client and API first; rollback cannot restore data from an account
deletion that already completed.

## Personal default bowls

`20260831120000_add_user_bowl_defaults.sql` adds `user_bowl_defaults` and the
authenticated `get_my_bowl_context()` / `set_my_default_bowl(uuid)` RPCs.
Deploy this migration before the default-bowl/global-add client. Older clients
can continue using the unchanged `get_my_bowls_with_counts` RPC.

The first creation or membership acquisition initializes a new account's
default. Backfill and access-loss repair rank accessible bowls by persisted
undrawn count descending, trimmed case-insensitive name in the `C` collation,
then UUID. Ownership alone grants access. Valid defaults stay put; they are
not recomputed when counts change. Per-user advisory locks serialize initial
selection and explicit changes. Deletion clears the foreign key; the next
context read repairs the choice outside the delete cascade. RLS allows only
own-row reads; direct preference writes and helper calls are private.

The matching pgTAP file has 30 assertions. The separate-connection race checks
need a database that outlives the run, so keep one and point them at it:

```sh
PGTAP_KEEP=1 ./scripts/pgtap.sh
python3 scripts/test-default-bowl-concurrency.py \
  --database-url postgres://postgres@localhost:5432/movie_bowl_pgtap_NNNN
```

Rollback is in `rollback/20260831120000_remove_user_bowl_defaults.sql`: retire
dependent clients first. It discards preferences, not bowls or movie/history
data. Prefer reverting the client while keeping this additive schema.

The August 31 follow-up corrected four older suites' stale expectations about
guest attribution, private helper access, and personal-history visibility.
The current regression baseline is 18 SQL suites / 487 assertions against a
disposable copy of the current schema, and it passes clean — see
[Local pgTAP verification](#local-pgtap-verification). See the
[implementation record](../output/designs/default-bowl-and-global-add-implementation.md#implementation-record--august-31-2026)
for the original failures and follow-up coverage. Do not run these fixture
scripts against the hosted database.

## Invitation write hardening

`20260902120000_harden_bowl_invitation_writes.sql` adds one live pending
invitation per normalized bowl/email pair, a private persisted batch-request
ledger, the idempotent owner-only `create_bowl_invites` RPC, and the guarded
owner-only `revoke_bowl_invite` RPC. Tokens are generated in PostgreSQL. A
same-key retry replays its recorded per-address outcomes and redacts invitation
IDs and tokens that are no longer live instead of recreating them.

The linked production schema was audited on September 2, 2026 before the
migration was written: eight total invitation rows, zero pending rows, and zero
duplicate pending groups. The migration checks again and stops with a clear
error if duplicate pending rows appear before deployment; resolve those rows
deliberately rather than editing the migration to discard one.

The same release moves the current create-bowl and Bowl Settings owner paths to
the RPCs, removes owner direct INSERT/DELETE policies, and removes the obsolete
invitee UPDATE path. Invitee SELECT/DELETE remains for received-invitation
decline and the cleanup after leaving a bowl. Deploy the migration immediately
before the matching web client: the new client requires the RPCs, while older
clients can no longer create or revoke invitations after the policy cutover.

The matching pgTAP file has 63 assertions; the full database regression is 17
suites / 467 assertions. Rollback is
`rollback/20260902120000_restore_direct_bowl_invitation_writes.sql`; revert the
client first. Rollback drops persisted request history, so retrying an old
request UUID afterward no longer has an idempotency record.

## TV pairing rate limits

`20260905120000_rate_limit_tv_pairing.sql` adds a server-only fixed-window
counter and a narrow service-role RPC. Pairing starts consume a client-address
bucket; approvals consume both a client-address bucket and an authenticated-user
bucket. The server stores only HMAC-SHA256 pseudonyms derived with
`TV_PAIRING_RATE_LIMIT_SECRET`, never raw addresses or user IDs. Old counters are
removed opportunistically.

Apply the migration and add the server-only secret before deploying the matching
API code; the endpoints deliberately fail closed if either dependency is absent.
The matching pgTAP file has 15 assertions. Rollback is
`rollback/20260905120000_remove_tv_pairing_rate_limits.sql`; revert the API code
before dropping its RPC.

## Active movie uniqueness note

`20260723200000_prevent_duplicate_active_movies.sql` prevents new duplicate
positive TMDB IDs among a bowl's undrawn movies. Its private registry preserves
pre-existing duplicate rows while blocking additional copies. Custom entries
and watched movies are not included in the uniqueness rule.

## Filter metadata cache note

`20260828120000_add_tmdb_filter_metadata_cache.sql` adds a private, global cache
of normalized US certifications and streaming providers for active TMDB movies.
The active-movie registry seeds missing cache rows automatically. Authenticated
bowl members can read only their bowl's cache snapshot through
`get_bowl_filter_metadata`; refresh claims and writes are restricted to the
server service role. The Vercel daily worker keeps successful snapshots for use
when a later TMDB refresh fails, prunes titles no longer active in any bowl, and
expires TMDB-derived values before the six-month caching limit.

`20260829010000_add_filter_metadata_refresh_run_history.sql` adds private daily
run reporting in `tmdb_filter_metadata_refresh_runs`. Each cron invocation
records attempted, successful, and failed title counts, duration, completion
status, and the remaining stale backlog. Only the service role can read or
record reports. Recording a run prunes history older than 90 days.

`20260917022736_add_tmdb_provider_availability.sql` extends the cache with
structured US availability groups (`subscription`, `free`, `ads`, `rent`, and
`buy`) plus TMDB's regional watch URL. The existing flat provider list remains
the eligibility list used by bowl filters, so subscription, free, and
ad-supported services can match while rent and purchase options stay
informational. Existing cache rows remain compatible and gain the new fields on
their next refresh.

Rollback is available via:

- `supabase/rollback/20260828120000_remove_tmdb_filter_metadata_cache.sql`
- `supabase/rollback/20260829010000_remove_filter_metadata_refresh_run_history.sql`
- `supabase/rollback/20260917022736_remove_tmdb_provider_availability.sql`

## Provider title-link cache

`20260830120000_add_title_provider_links.sql` creates private provider-link and
monthly request-count tables. Only the service role can call begin, complete,
fail, and prune RPCs. Begin verifies the signed-in user's bowl/title access
before reading cached data or atomically reserving budget. Drawn slips remain
eligible; custom IDs and non-US regions are rejected. Empty successes are
cached and failures back off.

The existing daily filter-metadata cron also deletes vendor rows at 29 days,
including when lookups are disabled, to keep within Watchmode's free-plan
30-day retention limit. Lookup-time expiration independently refuses old data.
This cleanup does not refresh links or spend vendor quota. Monitor cron errors.

Apply the migration before deploying the new server code. Rollback is
`supabase/rollback/20260830120000_remove_title_provider_links.sql`; revert the
server cleanup call before dropping its RPC. Account cancellation also requires
deleting stored vendor rows, as documented in the root README.

## Pinned movie note

`20260829170000_add_pinned_bowl_movies.sql` lets an authenticated contributor
pin one owned undrawn slip per bowl. A partial unique index enforces one pin,
the narrow security-definer RPC moves it atomically, and both ordinary and
rotation draws clear the selected pin. Rotation considers the pin only after
choosing the contributor, so turn order is unchanged.

Rollback is available via
`supabase/rollback/20260829170000_remove_pinned_bowl_movies.sql` and discards all
saved pins.

## Public add links note

Public add links are introduced by:

- `20260406120000_add_public_bowl_add_links.sql`
- `20260406130000_add_public_add_link_names.sql`
- `20260406140000_replace_add_link_revocation_with_deletion.sql`

Current behavior:

- public add links support per-link default contributor labels
- per-movie public-link attribution is stored on `public.bowl_movies.added_by_name`
- public-link movies have `added_by IS NULL`; the guest is not the link creator
- links are deleted rather than revoked
- a link is auto-deleted immediately when its final allowed add is consumed

Rollback is available via:

- `supabase/rollback/20260407120000_revert_public_bowl_add_links.sql`

Important caveat for rollback:

- the rollback sets `public.bowl_movies.added_by` back to `NOT NULL`
- that only works if there are no link-created movie rows with `added_by IS NULL`
- if public add-link movies already exist, delete or backfill those rows before applying the rollback migration
- if you need to use the rollback migration, move it back into `supabase/migrations` with a fresh later timestamp before running `supabase db push`

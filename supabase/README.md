# Supabase Migrations

This directory is the source of truth for Movie Bowl database schema and RLS policy changes.

## One-time setup

1. Install the Supabase CLI.
2. Link this repo to your existing Supabase project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

3. Pull your current remote schema as a baseline migration:

```bash
supabase db pull
```

Commit the generated migration before making new DB changes.

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

## Local pgTAP verification and cleanup

```bash
./scripts/pgtap.sh                            # every suite
./scripts/pgtap.sh supabase/tests/20260904120000_*.sql   # one suite
```

The script builds a disposable local Supabase project seeded from the linked
project's schema, applies any migration not yet deployed, runs the suites, and
removes the project on exit including on failure. It never touches the hosted
database: pgTAP writes rows.

A clean run is **17 suites / 472 assertions, all passing**. If yours is not
green, that is your change.

### Why the baseline needs a privilege reset

This is worth understanding before changing the script, because the failure it
prevents looks exactly like a product defect.

The repository's migration history does not include the original schema
baseline, so a local run has to start from a schema-only dump of the linked
project. But `pg_dump` renders the ACL it wants each object to **end up** with,
assuming the target starts from Postgres defaults — and a Supabase database does
not. Supabase grants `anon`, `authenticated` and `service_role` by *default
privilege*, so every object the restore creates is born with explicit grants,
and the dump's `REVOKE ALL ... FROM PUBLIC` does not remove them: `PUBLIC` and
`anon` are different grantees.

The real migrations revoke `from public, anon, authenticated` by name. That is
why production is correct and a naive reconstruction is not.

So the script clears those default privileges before restoring, which makes the
dump's own grants authoritative; the dump restores the same defaults at its end,
so objects created afterwards match production again. Without it the suite
reports about **70 phantom privilege failures** across 16 files and can never go
green — which is how it sat, unexamined, until September 2026.

### Writing suites

Test client operations under `authenticated` or `anon` through public RPCs;
private helpers such as `can_draw_from_bowl` must remain inaccessible. Personal
watch history is readable only by its user. Verify each user's visibility
under their role, then `reset role` for assertions auditing persisted rows
across participants. Restore the client role and JWT before further RPC calls.

### Docker images

The script removes its own project and volume. It does **not** remove images,
deliberately: a fresh disposable project pins its own Postgres image, so
deleting that image only guarantees a multi-gigabyte re-download on the next
run. If you are reclaiming space, inspect with `docker system df -v` and remove
specific superseded image IDs by hand. Never a broad `docker system prune`;
other local projects may depend on unrelated images or volumes.

## Drift rule

Avoid dashboard-only schema/policy changes. If an emergency dashboard edit happens, immediately backfill it into a migration file and commit.

## Legacy queue table note

`public.bowl_movie_queue` remains for compatibility with older migrations and rows, but active app code no longer writes to it.
The equal-probability contributor draw migration promotes pending queue rows into `public.bowl_movies`.

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

The matching pgTAP file has 30 assertions. Run the separate-connection race
checks against the disposable local project:

```sh
python3 scripts/test-default-bowl-concurrency.py --container supabase_db_movie-bowl-defaults-db.SUFFIX
```

Rollback is in `rollback/20260831120000_remove_user_bowl_defaults.sql`: retire
dependent clients first. It discards preferences, not bowls or movie/history
data. Prefer reverting the client while keeping this additive schema.

The August 31 follow-up corrected four older suites' stale expectations about
guest attribution, private helper access, and personal-history visibility.
The current regression baseline is 17 SQL suites / 472 assertions against a
disposable copy of the current schema, and it passes clean — see
[Local pgTAP verification and cleanup](#local-pgtap-verification-and-cleanup). See the
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

The matching pgTAP file has 63 assertions; the full database regression is 16
suites / 452 assertions. Rollback is
`rollback/20260902120000_restore_direct_bowl_invitation_writes.sql`; revert the
client first. Rollback drops persisted request history, so retrying an old
request UUID afterward no longer has an idempotency record.

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

Rollback is available via:

- `supabase/rollback/20260828120000_remove_tmdb_filter_metadata_cache.sql`
- `supabase/rollback/20260829010000_remove_filter_metadata_refresh_run_history.sql`

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

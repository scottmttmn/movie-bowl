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

Run database tests against a disposable local Supabase project, never against
the hosted database. This repository's checked-in migration history does not
currently include the original schema baseline. If a clean `supabase start`
fails because an early migration expects an existing table, export only the
linked project's `public` schema (no rows) to a temporary file and use that as
the disposable project's baseline. Do not commit that export.

After every disposable pgTAP run:

1. Stop the exact test project and delete its test-only Docker volume:

   ```bash
   supabase stop --workdir /path/to/disposable-project --no-backup
   ```

2. Delete the disposable project directory and temporary schema-only export.
   These must always be explicit paths under a temporary directory.
3. Run `docker system df -v` and remove only the unused image IDs that were
   newly pulled for the test with `docker image rm IMAGE_ID...`. Supabase can
   download them again on the next database test.

Do not use a broad `docker system prune`; other local projects may depend on
unrelated Docker images or volumes.

## Drift rule

Avoid dashboard-only schema/policy changes. If an emergency dashboard edit happens, immediately backfill it into a migration file and commit.

## Legacy queue table note

`public.bowl_movie_queue` remains for compatibility with older migrations and rows, but active app code no longer writes to it.
The equal-probability contributor draw migration promotes pending queue rows into `public.bowl_movies`.

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

## Public add links note

Public add links are introduced by:

- `20260406120000_add_public_bowl_add_links.sql`
- `20260406130000_add_public_add_link_names.sql`
- `20260406140000_replace_add_link_revocation_with_deletion.sql`

Current behavior:

- public add links support per-link default contributor labels
- per-movie public-link attribution is stored on `public.bowl_movies.added_by_name`
- links are deleted rather than revoked
- a link is auto-deleted immediately when its final allowed add is consumed

Rollback is available via:

- `supabase/rollback/20260407120000_revert_public_bowl_add_links.sql`

Important caveat for rollback:

- the rollback sets `public.bowl_movies.added_by` back to `NOT NULL`
- that only works if there are no link-created movie rows with `added_by IS NULL`
- if public add-link movies already exist, delete or backfill those rows before applying the rollback migration
- if you need to use the rollback migration, move it back into `supabase/migrations` with a fresh later timestamp before running `supabase db push`

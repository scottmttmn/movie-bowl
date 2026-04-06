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

## Drift rule

Avoid dashboard-only schema/policy changes. If an emergency dashboard edit happens, immediately backfill it into a migration file and commit.

## Queue removal policy note

`public.bowl_movie_queue` user removals are canonical hard deletes (`DELETE`), not `UPDATE removed_at`.
The `removed_at` column remains for compatibility with older rows/queries.

## Public add links note

Public add links are introduced by:

- `20260406120000_add_public_bowl_add_links.sql`

Rollback is available via:

- `20260406123000_revert_public_bowl_add_links.sql`

Important caveat for rollback:

- the rollback sets `public.bowl_movies.added_by` back to `NOT NULL`
- that only works if there are no link-created movie rows with `added_by IS NULL`
- if public add-link movies already exist, delete or backfill those rows before applying the rollback migration

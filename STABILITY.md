# Stability Guide

Practical guardrails for keeping Movie Bowl reliable as features evolve.

## What "Stable" Means Here

- Core user flows keep working after feature changes.
- Code and Supabase schema/RLS stay in sync.
- Shared UI and state layers stay predictable.
- Deployments have the required env vars and migrations applied.

## High-Risk Areas

Pay extra attention when changing:

- `src/hooks/useBowl.js`
- `src/components/MovieSearch.jsx`
- `src/components/AddMovieModal.jsx`
- `src/screens/BowlSettings.jsx`
- `supabase/migrations/*`

These areas combine permissions, shared behavior, or database-backed logic and are the most likely places for regressions.

## Core Flows To Protect

Before merging meaningful product changes, make sure these flows still work:

- login/auth
- create bowl
- invite accept
- add movie
- draw movie
- queue + auto-promotion
- public add links
- watch list

## Required Engineering Guardrails

### 1. Validate before merging

Run:

```bash
npm run test:run
npm run build
```

### 2. Keep Supabase changes in git

- Put schema, RLS, trigger, and function changes in `supabase/migrations/`
- Avoid dashboard-only DB edits without immediately capturing them in the repo
- Keep `supabase/README.md` current when DB behavior changes materially

### 3. Treat permissions as a first-class test surface

Whenever a feature touches ownership, membership, public access, or queue/add-link behavior, make sure the test coverage includes the relevant boundary:

- owner vs member
- authenticated vs public
- allowed vs denied mutation
- exhausted/used-up lifecycle cases

### 4. Be careful with shared components

Shared components should gain behavior deliberately and with focused tests:

- `MovieSearch`
- `AddMovieModal`
- `TopNav`
- `useBowl`

If one of these changes, add or update tests for the new behavior rather than assuming downstream screens will cover it.

## Release Smoke Checklist

Run this when shipping meaningful app behavior, especially if auth, DB, installs, or public links changed.

- log in successfully
- add a movie to a bowl
- draw a movie
- confirm watch list still loads
- confirm public add link still works
- confirm required Vercel env vars exist
- confirm new Supabase migrations are applied

If browser/app-shell metadata changed, also verify:

- tab title
- favicon
- `/manifest.webmanifest`
- Android/iOS home-screen install behavior

## Preferred Defaults

- Prefer small, focused migrations over large one-off DB rewrites
- Prefer one clear implementation path per feature
- Prefer removing replaced UI/logic paths instead of letting temporary behavior accumulate
- Prefer a few strong integration tests over many shallow ones

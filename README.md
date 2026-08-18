# Movie Bowl

**Live app: [moviebowl.app](https://moviebowl.app)**

Movie Bowl is a collaborative app for keeping a shared movie list and randomly
drawing what to watch next. Everyone in a bowl adds titles, and the draw picks a
contributor first — so the person who added 25 movies does not get 25× the odds.

## What It Does

**Bowls**

- Create bowls, invite people by email, and manage members.
- Return straight to the bowl you last opened; the full list stays at `/bowls`.
- Manage who is allowed to draw, per bowl (everyone, or a selected allow-list).
- Create public add links so people without accounts can add a fixed number of
  titles.

**Movies**

- Add movies from TMDB search, or add custom/manual entries.
- Open full movie details from a newly drawn movie, from search results, or from
  a watched movie card.
- Watch official TMDB trailers inline from movie detail views.

**The draw**

- Draw a random movie by first choosing an eligible contributor bucket
  uniformly, then choosing one movie from that bucket.
- Or let the bowl owner switch the bowl to a straight title-by-title draw, where
  every movie in the bowl is equally likely.
- Narrow the pool before drawing with rating, genre, and runtime filters, each
  with an "include unknown" escape hatch.
- Optionally prioritize titles available on your streaming services.
- See the bowl's active draw method explained without surfacing competitive odds.
- Return a drawn movie to the bowl without erasing the fact that it was drawn.

**History**

- Track bowl activity in a horizontal watched-movie strip.
- Keep a personal watch list at `/watch-list` that survives leaving or deleting
  a bowl, including manually added entries.
- Export watched titles as a Letterboxd-compatible CSV.

**TV**

- A separate TV experience at `/tv` with D-pad/remote spatial navigation, a bowl
  picker, and a theater-mode trailer pre-roll before the pick is revealed.
- A draw is treated as the decision: the result appears without a second
  acceptance step, and configured theater-mode previews begin automatically.
- Provider actions hand off to installed television apps when possible and keep
  the drawn result available when the viewer returns to Movie Bowl.

## Tech Stack

- React 19 + Vite 7
- React Router 7
- Supabase (auth, Postgres, RLS)
- Vercel serverless functions for anything needing a secret
- Tailwind CSS
- Vitest + Testing Library

## Local Setup

1. Install dependencies (Node `>=20.19 <21` or `>=22.12`):

```bash
npm install
```

2. Create `.env` with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
TMDB_READ_ACCESS_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_BASE_URL=https://moviebowl.app
RESEND_API_KEY=...
INVITE_EMAIL_FROM="Movie Bowl <invites@mail.moviebowl.app>"
```

`SUPABASE_URL` should match `VITE_SUPABASE_URL`.

3. Run locally.

For full local behavior, including `/api/*` routes:

```bash
vercel dev
```

If you only need frontend-only iteration, you can still use:

```bash
npm run dev
```

Note that `npm run dev` does not serve the serverless functions, so `/api/*`
requests 404 — TMDB search, invite email, and public add links need `vercel dev`.

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run lint` - run ESLint
- `npm run test` - start Vitest in watch mode
- `npm run test:run` - run tests once
- `npm run test:coverage` - run tests with coverage

## Project Layout

```
src/
  App.jsx            router, route guards, invite acceptance
  screens/           one screen per route, lazily imported
  components/        shared UI
  hooks/             stateful data layer (useBowl, useAuth, useAutosave, ...)
  lib/               external-service clients (supabase, tmdbApi, streamingProviders)
  utils/             pure logic (draw selection, filters, formatting, storage)
  tv/                self-contained TV experience: own screens, hooks, css
  index.css          design tokens + shared component classes
api/                 Vercel serverless functions (not part of the Vite build)
  _lib/              server-only helpers (supabaseAdmin, tmdb)
supabase/
  migrations/        source of truth for schema, RLS, functions
  tests/             pgTAP tests for security-sensitive migrations
  rollback/          staged reverts, kept out of migrations/ on purpose
output/designs/      design specs and roadmaps for shipped + planned features
```

### Routes

`/` (redirects to your last opened bowl), `/bowls`, `/bowl/:bowlId`,
`/bowl/:bowlId/settings`, `/settings`, `/watch-list`, `/invites`, `/about`,
`/login`, `/accept-invite/:token`, `/add-to-bowl/:token`, `/tv/*`.

Everything except `/login`, `/about`, `/accept-invite/:token`, and
`/add-to-bowl/:token` requires a signed-in user.

### Key Files

- App shell/routes: `src/App.jsx`
- Bowl state and draw handlers: `src/hooks/useBowl.js`
- Draw filtering: `src/utils/drawSelection.js`
- Draw candidate selection: `src/utils/selectDrawCandidate.js`
- Contributor bucketing: `src/utils/drawBuckets.js`
- User streaming settings hook: `src/hooks/useUserStreamingServices.js`
- Bowl dashboard UI: `src/screens/BowlDashboard.jsx`
- Bowl settings UI: `src/screens/BowlSettings.jsx`
- User settings UI: `src/screens/UserSettings.jsx`
- Watch list UI: `src/screens/WatchListPage.jsx`
- TV experience: `src/tv/TvApp.jsx`
- Invite email route: `api/invites/send.js`
- Public add-link routes: `api/add-links/*`

For how the code is put together and the conventions to follow when changing it,
see `CLAUDE.md`. For reliability guardrails and the release smoke checklist, see
`STABILITY.md`. `TODO.md` is the live backlog.

## Streaming-Service Logic

- User picks services in **User Settings**.
- Service names are normalized in `src/utils/streamingServices.js`.
- Provider availability is fetched from TMDB:
  - `src/lib/streamingProviders.js`
  - proxied through server routes in `api/tmdb/*` so the TMDB key stays server-side
  - includes in-memory caching + in-flight request deduping
- Draw behavior:
  - if the prioritize toggle is on and matches exist, draw from matches
  - if no matches, fall back to all remaining titles
- This narrowing happens *before* contributor bucketing, so it changes which
  titles are eligible, not the equal-per-person odds among them.

## Environment Variables

### Browser-visible

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These are visible in the browser bundle by design.

### Server-only

- `TMDB_READ_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `INVITE_EMAIL_FROM`

Do not prefix server-only values with `VITE_`. `SUPABASE_SERVICE_ROLE_KEY`
bypasses RLS, so every route that uses it must do its own authorization.

## Production Setup

### Canonical app domain

- Production app URL: `https://moviebowl.app`
- Configure `moviebowl.app` as the primary production domain in Vercel
- In Supabase Auth settings:
  - `Site URL` should be `https://moviebowl.app`
  - `Allowed Redirect URLs` should include:
    - `https://moviebowl.app`
    - `http://localhost:3000`
    - optionally `http://localhost:5173`

### Sending domain

- Use a dedicated sending subdomain for email:
  - `mail.moviebowl.app`
- Verify `mail.moviebowl.app` in Resend
- Add the DNS records Resend provides for that subdomain
- Recommended sender:
  - `Movie Bowl <invites@mail.moviebowl.app>`

### Auth email delivery

- The app uses Supabase magic-link auth
- Televisions use `/activate-tv` for QR pairing while phones and ordinary web
  browsers retain the magic-link flow
- TV pairing is handled by `POST /api/tv-pairing/start`,
  `POST /api/tv-pairing/approve`, and `POST /api/tv-pairing/poll`
- Pairing requests expire after ten minutes; only a device-secret hash is stored,
  and the approved TV receives a single-use Supabase token hash
- To avoid the default Supabase email rate limits, configure custom SMTP in Supabase Auth
- Recommended branded sender:
  - `Movie Bowl <auth@mail.moviebowl.app>`

### Invite email delivery

- Bowl invites are stored in `bowl_invites`
- The app sends invite emails through:
  - `POST /api/invites/send`
- Invite links inside those emails use:
  - `APP_BASE_URL`

### Public add-link delivery

- Bowl members can create public add links in Bowl Settings.
- Public add-link page:
  - `/add-to-bowl/:token`
- These routes use the Supabase service role on the server:
  - `GET /api/add-links/:token`
  - `POST /api/add-links/consume`
- Link users do not need to sign in.

## Data Model

Tables the app touches:

- `profiles`
- `bowls`
- `bowl_members`
- `bowl_movies`
- `bowl_invites`
- `bowl_draw_permissions`
- `tv_pairing_requests` (server-only; no direct client access)
- `bowl_add_links`
- `bowl_draw_events` — immutable bowl-side record of each draw
- `user_watch_events` — per-participant personal history
- `bowl_movie_queue` — legacy compatibility table; not written to

A draw writes one `bowl_draw_events` row plus one `user_watch_events` row per
participant, which is why personal history survives leaving or deleting a bowl.
Returning a movie to the bowl sets `returned_at` on the draw event rather than
deleting it.

Custom (non-TMDB) movies carry a negative synthetic `tmdb_id`, so anything that
calls TMDB must filter for `Number(tmdb_id) > 0` first.

RPCs the client calls (preferred over multi-statement client writes, because
they are the atomic and permission-checked path):

`get_my_bowls_with_counts`, `get_bowl_profile_directory`,
`get_my_invite_sender_directory`, `draw_bowl_movie`, `return_bowl_draw_to_bowl`,
`save_bowl_draw_access`, `delete_owned_bowl`, `consume_bowl_add_link`,
`create_manual_watch_event`, `update_user_watch_event`, `delete_user_watch_event`.

## Supabase Schema & Policies (Git-tracked)

Store all Supabase schema and RLS/policy changes in `supabase/migrations/` with
a timestamped filename — never make dashboard-only edits.

Quick workflow:

1. Link CLI to your existing project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

2. Pull current remote DB as baseline migration (one-time, if needed):

```bash
supabase db pull
```

3. Add new changes:

```bash
supabase migration new short_description
```

4. Apply to Supabase:

```bash
supabase db push
```

5. Commit migrations to git.

For permission-sensitive changes, add a pgTAP test in `supabase/tests/` and a
revert in `supabase/rollback/`. See `supabase/README.md` for details.

## Tests

Tests live in `__tests__/` next to the code they cover. Current coverage
includes:

- Bowl dashboard and draw flow tests (`src/screens/__tests__/BowlDashboard.*.test.jsx`)
- Bowl settings and invite integration tests
- Public add-link API and page tests
- Draw selection unit tests (`src/utils/__tests__/selectDrawCandidate.test.js`)
- Hook-level bowl integration tests (`src/hooks/__tests__/useBowl.test.js`)
- TV navigation and theater-mode tests (`src/tv/__tests__/`)
- pgTAP tests for security-sensitive migrations (`supabase/tests/`)

Run all tests:

```bash
npm run test:run
```

A clean checkout is expected to be fully green, with lint reporting zero
warnings. Run `npm run test:run` and `npm run build` before committing anything
non-trivial.

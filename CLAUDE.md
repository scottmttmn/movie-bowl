# CLAUDE.md

Guidance for AI assistants working in this repository.

Movie Bowl is a collaborative app for keeping a shared movie list and randomly
drawing what to watch next. Read `README.md` for the product overview and env
setup, and `STABILITY.md` for the reliability guardrails — this file covers how
the code is put together and what to do when changing it.

## Commands

```bash
npm install          # Node >=20.19 <21 or >=22.12 (see package.json engines)
npm run dev          # Vite dev server, frontend only — /api/* routes will 404
vercel dev           # full local behavior including /api/* serverless routes
npm run test:run     # run the whole Vitest suite once (the pre-merge gate)
npm run test         # Vitest watch mode
npm run test:coverage
npm run test:e2e     # Playwright release smoke suite; no production credentials
npm run lint         # ESLint, flat config
npm run build        # production build — run this for any UI/app change
```

Before committing anything non-trivial, run `npm run test:run` and `npm run build`.
A clean checkout is expected to be fully green (109 test files / 850 tests, lint
with zero warnings); if something fails, it is your change. Those counts are a
tripwire, not trivia — refresh them in the same commit that adds or removes
tests, or the next person cannot tell a stale number from a lost test.

Single test file: `npx vitest run src/utils/__tests__/drawSelection.test.js`.

## Architecture

React 19 + Vite 7 SPA, Supabase for auth and data, Vercel serverless functions
for anything that needs a secret. Tailwind for styling. No TypeScript, no state
library, no path aliases — imports are relative.

```
src/
  main.jsx           AuthProvider -> App
  App.jsx            router, route guards, invite acceptance
  screens/           one file per route, lazily imported by App.jsx
  components/        shared UI
  hooks/             stateful data layer (useBowl, useAuth, useAutosave, ...)
  lib/               external-service clients (supabase, tmdbApi, streamingProviders)
  utils/             pure logic (draw selection, filters, formatting, storage)
  tv/                self-contained TV experience: own screens, hooks, css
  index.css          design tokens + @layer components classes
api/                 Vercel serverless functions (Node, not bundled by Vite)
  _lib/              server-only helpers (supabaseAdmin, tmdb)
supabase/
  migrations/        source of truth for schema, RLS, functions
  tests/             pgTAP tests for security-sensitive migrations
  rollback/          staged reverts, kept out of migrations/ on purpose
tv-android/          Google TV WebView shell around /tv (Java, Gradle); a
                     validation harness, not a store build. Has its own README
android-mobile/      Disposable Android App Actions probe for the Gemini voice
                     capture Gate 0. It does not contain the product app.
output/designs/      design specs and roadmaps for shipped + planned features
```

Vercel Hobby allows 12 functions per deployment, and this app uses all 12.
`vercel.json` rewrites provider-link lookups and filter-metadata warmups to
`api/movie-cache.js`, which dispatches to their authorized handlers in `_lib/`.
Preserve both public URLs when changing that shared entry point.

### Layer rules

- `utils/` is pure and dependency-free. Anything that needs `fetch` or the
  Supabase client is injected as a function argument (see `selectDrawCandidate`
  taking `fetchProviders`, `getDrawSelection` taking `fetchMovieDetails`, and
  `randomFn` for determinism). Keep it that way — it is why the draw logic is
  cheaply testable.
- `hooks/` owns Supabase reads/writes and React state. `useBowl` is the state
  engine for a bowl (load, add, draw, delete, re-add) and returns handlers plus
  `errorMessage`; screens render, they do not re-implement bowl mutations.
- `lib/` wraps external services. `lib/tmdbApi.js` only ever talks to
  `/api/tmdb/*` — the browser must never see the TMDB token.
- `screens/` compose hooks and components for one route. They are large; prefer
  extending an existing screen's section over adding a parallel one.

### Staying current across deploys

A deploy replaces the hashed bundle, so a tab that is already open is running
code whose lazy chunks no longer exist -- historically a blank screen until
someone refreshed by hand. Three pieces prevent that, all reading
`utils/appVersion.js`:

- `vite.config.js` stamps each build with an id and emits it to `/version.json`,
  outside the hashed bundle. The id is `VERCEL_GIT_COMMIT_SHA`, else the
  checkout's own commit, else the clock. It never reflects the state of the
  working tree: the deploy builder's checkout is never clean by our standards,
  and tagging that as dirty made every production build unique again, which is
  the one thing the commit is there to avoid.
- `useAppUpdate` (rendered by `UpdateBanner`, mounted app-wide) compares the two
  and reloads unprompted where nothing can be interrupted -- on load, on
  returning to an app backgrounded for a minute, on a bfcache restore. While
  someone is mid-session it only offers the banner.
- `lazyScreen` in `App.jsx`, the `vite:preloadError` listener in `main.jsx`, and
  `AppErrorBoundary` recover the failure itself when it beats the check.

Every reload goes through `reloadForNewBuild`, which fires at most once a minute
via `sessionStorage` so a genuinely broken build cannot become a refresh loop --
and which is why an explicit tap on the banner calls `location.reload()` direct.
The check is production-only; the dev server has HMR and no manifest to serve.

### Routes (`src/App.jsx`)

`/` (HomeRedirect), `/bowls`, `/bowl/:bowlId`, `/bowl/:bowlId/settings`,
`/settings`, `/watch-list`, `/invites`, `/about`, `/login`,
`/accept-invite/:token`, `/add-to-bowl/:token`, `/tv/*`.

Everything except `/login`, `/about`, `/accept-invite/:token`, and
`/add-to-bowl/:token` is wrapped in `RequireAuth`. `/tv/*` and
`/add-to-bowl/*` deliberately render without the top nav. Screens are
`React.lazy` imports — add new ones the same way.

`/` resolves the account's saved home bowl through `get_my_bowl_context`, or
opens `/bowls` when there are no accessible bowls. A failed read shows Retry.
Explicit `/bowl/:bowlId` links never change it. `useUserBowls` shares the
account context and is the only writer, through `set_my_default_bowl`. Global
Add uses the home bowl, while “Add to this bowl” captures the viewed bowl. Both
use the same `BowlAddProvider` and `bowlMovieService`; keep pending operations
above routes and retain uncertain outcomes for status checks without
reinserting.

The dashboard header names the bowl and opens `BowlPicker`, which is the one
place the home bowl moves. Opening a bowl and making it home are deliberately
separate actions: rows navigate and push, so browser Back returns to the
previous bowl, and a single `Make [bowl] home` command below them writes the
account default. The home bowl carries a non-interactive badge — never a star or
an `aria-pressed` toggle, because a home bowl cannot be unset, only moved. My
Bowls still carries the older star affordance until it becomes the directory
surface; see `output/designs/dashboard-bowl-picker-and-home-bowl.md`.

## Data model

Tables the app touches: `profiles`, `bowls`, `bowl_members`, `bowl_movies`,
`bowl_invites`, `bowl_draw_permissions`, `bowl_add_links`, `bowl_draw_events`,
`user_watch_events`, `user_bowl_defaults`. `bowl_movie_queue` is legacy and is not written to.

The interface says **home bowl**; the database says **default**. That drift is
deliberate — do not rename deployed database objects to match the UI term:

| User-facing term | Database object |
| --- | --- |
| Home bowl | the account's `user_bowl_defaults` row |
| Resolving Home | `get_my_bowl_context` → `default_bowl_id` |
| `Make [bowl] home` | `set_my_default_bowl` |

The bowl-history split matters: a draw writes one immutable `bowl_draw_events`
row (bowl activity) plus one `user_watch_events` row per participant (personal
history that survives leaving or deleting the bowl). Returning a movie to the
bowl sets `returned_at` on the draw event; it never deletes the fact of the draw.

RPCs used by the client — prefer these over multi-statement client writes,
because they are the atomic/permission-checked path:

`get_my_bowls_with_counts` (legacy/TV), `get_my_bowl_context`,
`set_my_default_bowl`, `get_bowl_profile_directory`,
`get_bowl_filter_metadata`,
`get_my_invite_sender_directory`, `accept_bowl_invite`,
`create_bowl_invites`, `revoke_bowl_invite`, `draw_bowl_movie`,
`draw_bowl_movie_by_rotation`, `return_bowl_draw_to_bowl`,
`save_bowl_draw_access`, `save_bowl_draw_method`, `delete_owned_bowl`,
`set_own_bowl_movie_pin`, `consume_bowl_add_link`, `create_manual_watch_event`,
`update_user_watch_event`, `delete_user_watch_event`.

Invitations live at `/invites`, the one surface that sends, accepts, declines,
and revokes them. Bowl Settings keeps the member roster and links into the hub
with `?bowl=<id>`, which is a hint the hub honours only while the caller still
owns that bowl; My Bowls links to it rather than acting on invitations itself.
Owner-side writes go through `create_bowl_invites` and `revoke_bowl_invite`,
which own normalization, uniqueness, server-generated tokens, idempotent replay
of a batch, and the accept-versus-revoke race. The client never inserts a
`bowl_invites` row or deletes another person's; invitees still delete their own
to decline. `useSentInvitations` holds one request id across retries so a resend
after a timeout replays the batch instead of creating a second live invitation.

Custom (non-TMDB) movies carry a **negative synthetic `tmdb_id`** so that
NOT NULL deployments still accept them. Any code that hits TMDB must filter for
`Number(tmdb_id) > 0` first.

### Supabase changes

All schema, RLS, policy, trigger, and function changes go in
`supabase/migrations/` with a timestamped filename — never dashboard-only edits.
Apply with `supabase db push` and commit the file. For permission-sensitive
changes, add a pgTAP test in `supabase/tests/` and a revert in
`supabase/rollback/` (rollbacks live outside `migrations/` and must be moved
back with a fresh timestamp to run). See `supabase/README.md`.

When pgTAP needs a schema-only hosted baseline, use a disposable local
Supabase project and never export hosted rows. After the run, stop that exact
project with `--no-backup`, delete its temporary directory and schema export,
and remove only Docker images newly pulled for the test. Never use a broad
Docker prune. The cleanup checklist is in `supabase/README.md`.

## The draw

This is the core of the product and the most sensitive logic in the repo.

`useBowl.handleDraw` → `getResolvedDrawPool` (`utils/drawSelection.js`) applies
rating, genre, and runtime filters in that order, then streaming priority. Each
ordinary filter has an `includeUnknown` escape hatch and a specific user-facing
message when it empties the pool. Person-first and title-first select from that
pool in the client and persist through `draw_bowl_movie`. Rotation passes the
resolved ids to `draw_bowl_movie_by_rotation`, which selects and persists in one
serialized transaction. Every path reloads the bowl afterward.

The final pick is the bowl's **draw method**, an owner-controlled setting on
`bowls.draw_method` saved through `save_bowl_draw_method`. The methods live in
`utils/drawMethods.js` — a registry keyed by id, each owning its selection mode
and the copy every surface renders. Client-selected methods also own `pick` and
may own `buildOdds`. `normalizeDrawMethod` falls back to the default for
anything unrecognized, so a value written by a newer deploy cannot break an
older client.

The default is and stays **person-first**: bucket the candidates by contributor
(`getContributorBucketKey`), pick a bucket uniformly at random, then pick a
movie within it. Someone who added 25 titles does not get 25× the odds. That is
a stated product promise for person-first bowls. `title_first` is a flat raffle
and exists only because an owner explicitly chose it — never make it the
default, and never turn person-first into it as an optimization or a side
effect.

**Rotation** is contributor-first but history-aware: among contributors in the
actual eligible pool, a never-drawn contributor goes first; otherwise the least
recently drawn contributor goes next, with random tie-breaking and a random
title within that contributor's pool. Returned draws still count. The database
locks the bowl row and owns this choice so concurrent phone/TV draws cannot
award the same turn twice. The ordinary draw RPC rejects rotation bowls to keep
older cached clients from silently applying person-first behavior.

The method replaces only the last step of selection. It runs on whatever pool
survives filtering and streaming priority, and it never re-expands or reorders
those stages. The shared resolver can return raw movie rows or
`{ movie, providers }` wrappers; client methods must handle both, while a server
method accepts their ids and maps its returned id back to the same candidate.

Method copy has one source of truth. `DrawMethodDisclosure`, the TV preference
list, and Bowl Settings all read `label`/`description`/`disclosure` off the
registry — do not hardcode a sentence about odds anywhere else.

Streaming prioritization narrows the pool *before* the contributor bucketing:
with `prioritizeByServiceRank` it keeps only the top-ranked matching service,
otherwise all matches; either way an empty match set falls back to the full
incoming pool. `getStreamingPriorityPool` is shared by selection and the
phone/TV eligibility readouts so those surfaces reflect the same post-filter,
post-rank pool, including the fallback behavior for manual titles. Movie
ratings are cached in-module for an hour; providers for ten minutes
with in-flight dedupe (`lib/streamingProviders.js`). Both expose a
`clear*Cache()` for tests.

Draw access is per bowl: `bowls.draw_access_mode` is `"all_members"` or
`"selected_members"`, with the allow-list in `bowl_draw_permissions`, saved
through `save_bowl_draw_access`.

## Serverless routes (`api/`)

Plain Vercel handlers: `export default async function handler(req, res)`,
405 on the wrong method, 400 on bad input, `console.error("[api/path] ...")`
then a generic 500. They run in Node and are excluded from coverage; they are
**not** part of the Vite build, so `npm run dev` alone cannot exercise them.

- `api/tmdb/*` proxies TMDB so `TMDB_READ_ACCESS_TOKEN` stays server-side.
- `api/provider-links/lookup` verifies the bearer token and bowl/title access
  before a Watchmode lookup. It defaults off unless `PROVIDER_LINKS_ENABLED=true`
  and `WATCHMODE_API_KEY` is set. `PROVIDER_LINKS_MONTHLY_BUDGET` is enforced
  atomically in Supabase (default 500 HTTP requests, currently 1,000 Watchmode
  credits). Add and draw events warm the private cache; public adds do not.
- `api/cron/refresh-filter-metadata` maintains the private daily certification
  and provider cache. It requires `CRON_SECRET`, uses the service role, and must
  remain compatible with Vercel Hobby's once-daily schedule and 60-second cap.
  It also deletes provider-link rows at 29 days, even with lookups disabled,
  to satisfy the free vendor plan's 30-day retention limit. This spends no
  Watchmode quota. Apply the provider-link migration before deploying this call.
- `api/add-links/*` and `api/invites/send.js` use the service-role client from
  `api/_lib/supabaseAdmin.js`. This key bypasses RLS — every route using it must
  do its own authorization, and none of it may ever reach a `VITE_` variable.

## Conventions

- Double-quoted strings and semicolons in `src/` and `api/`; two-space indent.
  Config files at the root use single quotes — match the file you are in.
- Components and screens: PascalCase file, default export. Hooks: `useThing.js`,
  default export. Utils: named exports.
- Logs are prefixed with the module: `console.error("[useBowl] Failed to …", error)`.
- Mutations that a screen must react to return a result object
  (`{ ok, code, message }` via `addResult` in `useBowl`) rather than throwing.
  User-facing copy lives in that message; screens display it verbatim.
- Optimistic UI is opt-in and marked: rows get `local_status: "syncing"` and a
  `local_temp_id`, and are excluded from draws and odds until they persist.
- Style with the shared classes in `src/index.css` (`page-container`, `panel`,
  `panel-muted`, `surface-card`, `btn` + `btn-primary`/`btn-secondary`/
  `btn-ghost`/`btn-danger`, `icon-btn`, `input-field`, `modal-overlay`,
  `modal-surface`, `section-stack`, `section-title`, `eyebrow`, `page-hero`,
  `status-success`/`status-warning`/`status-error`) and the `--color-*` tokens.
  Reach for raw Tailwind only for layout. The app is dark-only by design.
- TV screens are a separate visual system in `src/tv/tv.css` with its own
  `tv-*` classes. Focusable TV elements need `data-tv-focusable` (and
  `data-tv-autofocus` for the initial target) so `useTvSpatialNavigation` can
  find them — remote D-pad navigation is geometric, not DOM order.
- Comments explain *why*, and are used sparingly at decision points. Follow the
  density of the file you are editing; `useAutosave.js` and `lastOpenedBowl.js`
  are good examples of the house voice.
- Browser storage is always wrapped in try/catch with a comment saying the
  feature degrades rather than breaks.

## Testing

Vitest + Testing Library, jsdom, setup in `src/test/setup.js`. Tests live in
`__tests__/` next to what they cover, named `Thing.test.js(x)` or
`Screen.feature.test.jsx` for focused slices of a large screen (e.g.
`BowlDashboard.drawFlow.test.jsx`, `BowlDashboard.guards.test.jsx`).

- Mock the Supabase client with `vi.hoisted()` + `vi.mock`, exposing a mutable
  `state` object the test mutates per case. Copy the pattern from
  `src/screens/__tests__/BowlDashboard.drawFlow.test.jsx`.
- For draw logic, inject `randomFn` and a fake `fetchProviders` instead of
  stubbing `Math.random` globally.
- API handler tests build a tiny fake `res` with chainable `status`/`json` (see
  `api/__tests__/addLinks.consume.test.js`).
- Permissions are a first-class test surface: whenever a change touches
  ownership, membership, public/anonymous access, or link lifecycle, cover
  owner vs member, authenticated vs public, allowed vs denied, and exhausted
  cases — in JS tests and, for DB-level rules, in `supabase/tests/`.
- Playwright smoke tests live in `e2e/*.e2e.js`. They run against the Vite app
  with external HTTP boundaries supplied by `e2e/support/fakeBackend.js`; keep
  product code on its normal Supabase and `/api/*` paths. Install the browser
  once with `npx playwright install chromium`. `npm run test:e2e` covers desktop
  and mobile layouts, retains failure artifacts under `test-results/`, and must
  not use production credentials or data.

## Working agreements

- Keep changes narrow enough to review and manually QA in one pass. The
  iteration loop and the release smoke checklist in `STABILITY.md` apply.
- Highest-risk files, per `STABILITY.md`: `src/hooks/useBowl.js`,
  `src/components/MovieSearch.jsx`, `src/components/AddMovieModal.jsx`,
  `src/screens/BowlSettings.jsx`, `supabase/migrations/*`. Shared components
  (`MovieSearch`, `AddMovieModal`, `TopNav`, `useBowl`) gain behavior only with
  matching tests — do not assume downstream screens cover it.
- Flows that must keep working: login, create bowl, accept invite, add movie,
  draw movie, public add links, watch list.
- Remove the path you replaced rather than leaving both alive. Prefer one clear
  implementation per feature and a few strong integration tests over many
  shallow ones.
- `output/designs/*.md` holds the intent behind features. Several are explicitly
  **plans, not implementations** (`bowl-draw-methods.md`, `solo-draw.md`, later
  phases of `tv-theater-mode.md`) — check the status line before assuming code
  exists. `TODO.md` is the live backlog; update it when you land or add an item.
- Commit subjects are imperative and sentence-case, no prefixes or emoji
  ("Land returning users in their last opened bowl"). Bodies explain the
  reasoning when the change is not obvious.
- Never put a Claude session link in anything pushed to this repo — no
  `Claude-Session:` commit trailer, no session URL in a PR body or comment.
  This repo is public, so those links are world-readable.

# Default Bowl and Global Add — Implementation Plan

Status: implemented locally on August 31, 2026; not deployed.
The implementation record at the end lists verification results and release
checks. The plan below preserves the decisions made before implementation.

The [design specification](default-bowl-and-global-add.md) owns presentation,
copy, and interaction details. This plan owns persistence, integration,
sequencing, and release gates. Read both when implementing.

## Scope and decisions

Ship a personal default bowl, its star on My Bowls, Home routing to that bowl,
and one shared bowl-add dialog available from the navigation and dashboard.
Keep the separate manual watch-history workflow.

| Question | Decision for this version |
| --- | --- |
| Where is the default saved? | A small account-owned Supabase table, separate from profile/settings updates; narrow RPCs own writes. No local-storage authority. |
| First bowl versus migration? | The first creation or membership acquisition initializes a new user's default in the database. Existing accounts are backfilled using the same most-undrawn rule as replacement. |
| What counts as accessible? | Ownership **or** membership. An owner does not need an additional membership row. |
| How are ties broken? | Most persisted undrawn slips, then case-insensitive, trimmed bowl name in a fixed database collation, then UUID. The display name is unchanged. |
| When is a lost default replaced? | On the next authoritative bowl-context resolution, immediately requested after local leave/delete actions and before Home/global Add use it. Do not choose a replacement inside delete cascades. |
| How quickly do other devices see changes? | Refresh on app entry, returning to the foreground, Home, opening Add, and entering My Bowls. No new realtime subscription or polling loop. |
| Where does the add operation live? | One controller above phone/web routes, using an extracted version of the existing add mutation. Do not mount another full `useBowl` engine. |
| How is the selector ordered? | Preserve My Bowls' owned/shared grouping and activity ordering; flatten those groups for the small selector. Never move the default or selection to the top. |
| How many bowls fit? | Options scroll at a maximum of 224px, reduced for the available viewport. Joined bowls are not limited by the ten-owned-bowl creation cap. |
| Do we change other experiences? | No TV picker, public-add-link, draw, pin, streaming preference, or voice-assistant redesign. Preserve the current browser microphone search. |

No new Vercel API route, third-party UI package, global state library, or
offline write queue is needed.

## Constraints recorded before implementation

- [`useAuth`](../../src/hooks/useAuth.js) creates/updates a profile
  asynchronously. A default must not depend on that profile write finishing.
  [`useUserStreamingServices`](../../src/hooks/useUserStreamingServices.js)
  owns streaming/draw preferences and must not accidentally reset the default.
- [`MyBowlsScreen`](../../src/screens/MyBowlsScreen.jsx) performs its own bowl
  reads. Its create flow inserts the bowl before inserting owner membership;
  the latter can fail even though ownership already grants access.
- Membership acquisition has two paths:
  [`usePendingInvites`](../../src/hooks/usePendingInvites.js) and the
  `AcceptInvite` screen inside [`App.jsx`](../../src/App.jsx). Membership can
  succeed even if marking the invite accepted fails.
- [`BowlSettings`](../../src/screens/BowlSettings.jsx) verifies that a leave
  actually removed membership. Its existing `delete_owned_bowl` RPC also
  preserves durable history and handles legacy queue cleanup. Keep that logic.
- [`HomeRedirect`](../../src/screens/HomeRedirect.jsx) currently trusts
  last-opened local storage. Dashboard access checks currently also route away
  on read errors; a transport error must not become evidence of lost access.
- [`useBowl`](../../src/hooks/useBowl.js) combines add writes, local guards,
  optimistic rows, draw state, and metadata warmups. Its add logic needs a
  controlled extraction, not a second implementation in navigation.
- [`MovieSearch`](../../src/components/MovieSearch.jsx) awaits metadata before
  calling its add callback. Capture the destination **before** that await.
  It is also used by public add and manual history, where that callback has
  different meanings.
- [`AddMovieModal`](../../src/components/AddMovieModal.jsx) serves both search
  and movie details. Preserve the recently implemented
  [movie-detail design](movie-details.md); do not restyle every detail modal.

## 1. Database contract

### Storage and authorization

Add `public.user_bowl_defaults`:

| Column | Contract |
| --- | --- |
| `user_id` | UUID primary key, references `auth.users(id)` with account-delete cascade |
| `bowl_id` | Nullable UUID, references `bowls(id)` with `ON DELETE SET NULL` |
| `updated_at` | Server timestamp of the most recent saved choice or repair |

One row per user prevents competing defaults. Null means there is no resolved
accessible default. After remote membership removal, a saved ID can remain
stale until resolution; callers must use the resolver, not read the column and
navigate blindly.

Enable RLS. Authenticated users may read only their own preference row. Revoke
direct insert/update/delete from `public`, `anon`, and `authenticated`; allow
writes only through the functions below. Do not expand profile table grants.

Public RPCs:

| RPC | Input and result |
| --- | --- |
| `get_my_bowl_context()` | No user-ID argument. Requires `auth.uid()`. Ensures a valid saved default and returns `{ default_bowl_id, bowls }`. |
| `set_my_default_bowl(p_bowl_id uuid)` | Requires a non-null, accessible bowl. Saves it for `auth.uid()` and returns the same context shape. Selecting the current default is an idempotent success. |

Each bowl in `bowls` carries the existing list fields: `id`, `name`,
`owner_id`, `remaining_count`, `member_count`, and `last_activity_at`. Derive
Owner/Member in the client. Return an empty array and null default for zero
bowls. Preserve `get_my_bowls_with_counts()` and its return signature for TV
and older clients.

Use security-definer functions with a fixed safe search path and qualified
object references. Grant the two public RPCs only to `authenticated`. Internal
helpers accepting a user ID are not executable by public/anonymous/authenticated
clients. Check access inside the setter; a foreign key alone does not establish
membership. Invalid/inaccessible IDs return a generic permission error without
revealing another user's bowl information.

### One selection rule

Use one internal candidate query/helper for backfill and repair. A candidate
is a distinct bowl owned by the user or joined by the user; membership joins
must not multiply movie counts.

```sql
-- Ordering of accessible candidates; not a client-side sort.
ORDER BY remaining_count DESC,
         lower(btrim(name)) COLLATE "C" ASC,
         id ASC
```

`remaining_count` counts stored `bowl_movies` rows whose `drawn_at IS NULL`.
Include every contributor, custom titles, public-link additions, and any
pre-existing duplicate slips. Exclude optimistic UI rows, legacy queue rows,
drawn movies, filters, and streaming preferences. Empty bowls have count zero.
Names differing only in case or surrounding spaces tie on name; UUID settles
that tie. This keeps the rule deterministic across devices without additional
product concepts such as last activity or membership age.

Resolution must:

1. Serialize preference decisions for this user using one transaction-scoped
   advisory lock shared by initialization, resolution, and explicit selection.
2. Re-read the saved choice after acquiring the lock.
3. Keep it unchanged if it is still accessible, regardless of counts.
4. Otherwise choose the first accessible candidate, or null, and persist once.
5. Return the resolved choice and accessible list; never return a choice absent
   from the returned list. If membership changes during separate internal reads,
   retry resolution once, then return a transient error rather than an
   inconsistent result or an unbounded loop.

Do not hold locks across browser work or metadata fetches. Loss can still occur
after a response; the eventual add is independently protected by current RLS.
For resolver reads, permit one bounded retry on a definite transaction-abort
error (`40P01`/`40001`), not on an ambiguous write outcome. Exercise concurrent
create/join/set/delete with separate database sessions before release.

### Initialization and access lifecycle

Install small acquisition triggers on `bowls` insert and `bowl_members` insert.
They invoke the same internal ensure-default helper for the new owner/member
inside the acquisition transaction. Handle changes to owner/user/bowl identity
if those fields can be updated through supported writes. These triggers do
not change who may create bowls, invite people, or join.

For a user's first acquisition there is exactly one accessible bowl, so that
bowl becomes the default even if later invite bookkeeping or owner-membership
insertion fails. Subsequent acquisitions preserve a valid choice. Concurrent
first acquisitions must serialize: the first successful initializing
transaction wins, and a later transaction cannot overwrite it.

Backfill existing accounts in the migration using the same helper/ranking,
including users who only own bowls or only joined bowls. Preserve any already
saved, accessible choice if the migration is exercised against seeded data.
Accounts with zero bowls get null. Install the new objects/triggers and
backfill transactionally so acquisition cannot slip between rollout steps.

Do **not** pick fallbacks in membership-delete or bowl-delete cascade triggers:
the existing delete operation changes several related tables. Let deletion
clear the FK; let membership loss be detected by the resolver after the
operation commits. This also avoids treating intermediate cascade state as
the replacement candidates. A dormant account is repaired on its next use,
not by a scheduled job.

Local create/join/leave/delete paths refresh context after the authoritative
access change, even when subsequent email/invite cleanup fails. Preserve the
existing leave verification and atomic bowl-delete/history behavior. Failed
reads do not clear or replace a default.

## 2. Shared client bowl state and routing

Create `src/hooks/useUserBowls.js` with `UserBowlsProvider`. Mount it above
`AppShell` routes, keyed by authenticated user ID like `PendingInvitesProvider`.
Expose bowl rows, default ID, loading/error state, `refresh`, and
`setDefaultBowl`. Keep Supabase calls in the hook/data layer.

- Fetch only for signed-in phone/web app surfaces. Public add, logged-out,
  and TV routes must not start new default lookups merely by mounting Layout.
- Deduplicate concurrent refreshes. Use request/account generations to discard
  old responses, including a refresh started before a successful star change.
- Refresh on initial entry, foreground/focus, entering `/`, entering `/bowls`,
  and opening either Add entry point. Coalesce visibility/focus events; do not
  introduce polling or a new realtime dependency.
- Also invalidate after create, join, leave, delete, member removal, bowl
  rename, add/remove/draw/return, and manual-history removals. The latter actions
  update displayed counts/order but cannot replace a still-accessible default.
- Preserve last good state while refreshing. On a failed refresh, show the
  error and Retry; do not report zero bowls. A newly opened Add waits for its
  authoritative destination instead of enabling writes against a guess.
- Do not reinitialize an already open dialog's destination when this context
  refreshes. Only flag it unavailable if an authoritative result excludes it.

Move My Bowls' list reads to this provider. Keep owned/shared sections and the
existing activity-first order. Extract the display ordering into a shared
utility so the selector uses the same order; add an ID tie-breaker only where
activity and name both tie. This display order is separate from SQL fallback
ranking.

Change Home to wait for context, then replace-navigate to the default or
`/bowls` if the confirmed list is empty. On failure, show a retry state and a
My Bowls link; do not invent a default. The logo routes through `/`.
Explicit `/bowl/:bowlId` links still open that bowl without changing the default.

Remove last-opened reads/writes and their obsolete tests from Home,
BowlDashboard, and BowlSettings once the new routing is wired. Old per-user
storage keys may be ignored; no storage sweep or migration from their values
is needed. Leave unrelated remembered draw-filter preferences intact.

Distinguish confirmed access loss from network/server errors in dashboard
guards. Only confirmed loss triggers context repair and the existing return to
My Bowls. An unavailable network gets an error/retry state.

## 3. Extract and preserve the add operation

Create a shared data service such as `src/lib/addBowlMovie.js`, with Supabase
and metadata dependencies injected for tests, and a shell controller in
`src/hooks/useBowlAdd.js`. Extract the existing `useBowl.handleAddMovie`
normalization, guards, insert, and error mapping; keep its callable adapter
until all bowl-add entry points delegate to the same operation.

The service accepts an **explicit captured** account ID, bowl ID, movie,
comment, and submission ID. It must never resolve the default internally.
Retain `{ ok, code, message }`, adding the persisted row/submission ID as needed
for reconciliation. Every caller must distinguish failure from success.

Before inserting:

- Validate title and the existing 500-character comment rule; normalize note,
  genres, TMDB/custom IDs, and other snapshot fields exactly once.
- Refuse offline writes before creating an optimistic row. Check the current
  authenticated user still matches the captured account.
- Use a fresh accessible-bowl/undrawn-row read for the chosen bowl. A shell
  add must not depend on whether that dashboard happened to be mounted. Use
  the existing scoped profile directory for duplicate attribution as needed.
- Preserve the undrawn-limit message and positive-TMDB duplicate feedback;
  retain the database's active-TMDB uniqueness guard as the final authority.
  Scope in-flight protection by account, bowl, and normalized movie identity.
- Keep authenticated attribution, `is_pinned: false`, and the existing RLS
  insert policy. Custom titles may be repeated in separate intentional adds.

**Limit scope:** the current authenticated add checks 500 undrawn movies in
client state; the SQL return-to-bowl function also checks a count, but there is
no universal atomic capacity guard across all writers. This change replaces
the stale client check with a fresh preflight and preserves the rule. It does
not promise a hard concurrent cap or change public-add/return semantics.
Enforcing exactly 500 across every writer would be separate database work.

Use a client-generated UUID for the real `bowl_movies.id` of each submission,
separate from any UI-only optimistic marker. Reuse it for that submission's
reconciliation or explicit retry; never generate a new ID for an automatic
retry. This does not require a new receipt table or offline outbox.

Tighten the existing custom-title compatibility fallback: retry with a
synthetic negative TMDB ID **only** for a confirmed `tmdb_id` NOT NULL
violation, using the same submission UUID. The current fallback retries any
custom insert error; retaining that would risk a second insert after a lost
response. Keep null IDs on schemas that support them.

On confirmed success, reconcile using the returned persisted row, refresh
the affected bowl/counts, and retain the existing nonblocking provider-link
and filter-metadata warmups for positive TMDB IDs. Warmup failures do not fail
the add; custom titles skip them. No extra metered calls on modal open/search.

Keep one source of pending add operations in the controller. A matching
mounted dashboard can overlay its pending row using the existing optimistic
row conventions; a different dashboard must not display it. On failure remove
that overlay; on success reconcile by real submission ID so refreshes cannot
duplicate it. Invalidate only the affected bowl's movie data; do not reset
filters, draw settings, selection, or scroll by remounting the screen.

For a lost response, read back the submission UUID and verify its account,
bowl, and submitted identity before treating it as success. If that read
cannot establish the outcome, return `outcome_unknown`, retain the draft,
and show `Could not confirm whether [movie] was added to [bowl]. Check its
status before trying again.` Offer a read-only `Check add status` action;
do not automatically repeat the write. A retry of the same submission keeps
its UUID. Distinguish that primary-key reconciliation from a different
movie's active-TMDB duplicate error. Account changes discard local feedback
and prohibit further work under the new user's session.

## 4. Add session and component integration

Mount one `BowlAddProvider`/controller above route content and one
`BowlAddDialog` in the shell. Provide `openGlobalAdd()` and
`openBowlAdd(bowlId)`. The controller exists independently of the dialog's
visibility and the destination dashboard.

| Session state/event | Required behavior |
| --- | --- |
| Open global | Refresh context; initialize from saved default once. |
| Open contextual | Refresh context; initialize from the requested accessible bowl, never silently substitute the default. |
| Change destination | Preserve search/results/comment; this choice lasts only for this session. |
| Submit | Synchronously capture account generation, destination ID/name, movie/comment, and submission UUID; then hydrate metadata and write. |
| Metadata/write pending | Disable all add actions and destination changes. Closing is still allowed. |
| Confirmed success while open | Clear the submitted draft/details, keep destination, show success and focus search. |
| Failure while open | Preserve draft and destination; show the specific error. No success reset. |
| Close before submitting | Discard the unsent draft and temporary choice. |
| Close after submitting | Let the captured operation settle. Show a shell result naming movie and bowl if the dialog stays closed. |
| Reopen while pending | Reattach to the existing operation with its captured destination; do not start a second session/write. Once settled and closed, the next open follows its entry point normally. |
| Access lost | Block submission and preserve draft. Require another explicit choice, including `Use [name]` if only one bowl remains. |
| Sign out/account switch | Close and clear local state. Skip a not-yet-dispatched write; an already dispatched request may finish, but cannot publish into the new account. |

Give this flow an explicit raw-draft submit callback in `MovieSearch`, before
its current metadata await. The shell controller owns hydration for that
callback. Preserve the existing callback path for public add and manual
history; do not make those consumers instantiate the bowl controller or
inherit bowl-add success behavior. Search-result, custom-title, Enter-key,
and detail-panel adds must all enter the same captured submission path.

Extract the reusable movie-detail body from `AddMovieModal` for an inline
detail subview in the new dialog. Search and details share one add session
and one modal boundary. Back returns to preserved search/comment; destination
is read-only in details. Keep existing drawn/watched wrappers, trailer,
provider, comment, and pin behavior unchanged.

Route-specific changes:

- `TopNav`: original bowl artwork, logo through Home, one plus/filmstrip SVG
  button with `Add a movie` accessible name. Close the nav menu before opening.
- `BowlDashboard`: relabel both populated and empty-state entry points
  `Add to this bowl`; remove its separate search modal and success-close logic.
- `MyBowlsScreen`/`BowlCard`: a card container with separate open and star
  buttons, never nested buttons. Keep the old star until save succeeds and
  serialize competing star changes. No card movement or navigation on star.
- `WatchListPage`/`WatchHistoryEntryModal`: use `Log a watched movie` for the
  manual entry action and matching dialog title. Preserve date/comment and
  removal-of-own-slips behavior. Global Add on that page adds a bowl slip.

## 5. Layout, focus, and scroll details

Implement the agreed compact `Add to [Friday Night v]` control. Only the
name/chevron opens it. Render options immediately after the trigger and before
movie search; hide comments/results while expanded without unmounting or
clearing their state. No bowl search box or empty-state helper sentence.

Use a single options scroller with `max-height: 224px`, contained overscroll,
and a smaller computed maximum when the visual viewport is short. Use actual
available height, with dynamic viewport sizing and visual-viewport resize
handling for software keyboards. If there is not room for useful options and
the keyboard, opening the selector may blur search to dismiss the keyboard;
selection restores search focus. Never solve this by shrinking touch targets.

Keep the trigger/full destination and search reachable. Long names wrap. For
duplicate names show role and a short UUID suffix; extend the suffix on a
collision. A confirmed single accessible bowl has plain text, not a dropdown.
Scroll the selected option into view on open and each focused option into
view as Tab advances, without scrolling the page or reordering options.

Use a scoped modal/focus helper and explicit overlay ownership. Render the new
dialog in a portal outside the shell region made inert; trap focus and lock
background scroll. Register existing blocking phone/web dialogs and draw/reveal
overlays so global Add is unavailable behind them; make their backdrops cover
the navigation. This is integration work, not a redesign of those dialogs.

One layer handles Escape: selector closes first, inline details return to
search next, then the add dialog closes. Existing window-level Escape
listeners must ignore events owned by the active layer. Restore focus to the
invoking control, or global Add if the contextual control has unmounted.
Keep same-account session state above route changes; do not render the dialog
or private result banners on TV/public/logged-out surfaces.

## 6. Implementation sequence and gates

Use these as reviewable commits within the feature. Only the database step
is independently deployable; release the connected client behavior together.

| Step | Main files/work | Gate before continuing |
| --- | --- | --- |
| 1. Defaults in Supabase | New migration, pgTAP file, rollback; table, functions, acquisition triggers, backfill | Selection/permissions tests pass; concurrent lifecycle checks pass; existing deletion/history tests remain green. |
| 2. Shared bowl context | New `useUserBowls`, App provider, lifecycle invalidation in My Bowls/Invites/App/BowlSettings, shared display ordering | Owner-without-membership, partial invite/create success, account switches, refresh errors, and stale responses covered. |
| 3. Default star and routing | BowlCard/MyBowls, TopNav logo, HomeRedirect, dashboard access guard; retire last-opened authority | Star save/failure and one/zero/multiple-bowl routes work; visiting another bowl never changes default. |
| 4. Shared add service | Extract `useBowl` add logic, service/controller, fresh preflight, stable submission IDs and reconciliation | Existing add/offline/custom/duplicate/pin/draw tests plus delayed/unknown-response cases pass before UI replacement. |
| 5. Shared dialog and entry points | New dialog/selector, MovieSearch submit seam, inline detail body, overlay integration, nav/contextual actions, history wording | Both entries, repeated adds, scrolling, focus/Escape, pending close/reopen, and lost-access behavior pass. |
| 6. Release verification/docs | E2E fake backend and journeys, manual QA, README/Supabase notes, TODO/spec status | Full checks and smoke checklist pass; migration deployed before client activation. |

Do not invent fixed migration timestamps in advance; create the next migration
at implementation time after checking the repository's then-current history.
Do not rewrite earlier migrations.

## 7. Verification matrix

Prefer meaningful integration cases over a test for each setter or CSS class.

| Area | Required cases |
| --- | --- |
| Database access | Owner with no membership, ordinary member, unrelated user, anonymous caller; reject direct preference writes and arbitrary user-ID helper calls; reject inaccessible/nonexistent default. |
| Selection | First create and first join; later acquisitions preserve choice; rollout chooses largest undrawn count; equal counts, case/space name ties, UUID ties, all empty, one bowl, zero bowls; valid saved choice survives changed counts. |
| Lifecycle/concurrency | Leave, owner removal, deletion, loss of final bowl then new acquisition; concurrent first acquisitions and explicit star changes; setter racing deletion; history/queue behavior retained. Use separate SQL sessions for races, not only pgTAP's single transaction. |
| Provider/routing | Failed read does not clear choice; old account/older refresh cannot overwrite new state; Home/logo resolve default; direct deep links and My Bowls work; stale last-opened storage is ignored; no new TV/public lookups. |
| Add destination | Global on bowl B/history uses default A; contextual on B uses B; switch preserves draft; repeated adds keep temporary choice; reopen resets normally; external default change does not retarget open dialog. |
| Write safety | Slow metadata plus destination/default change; duplicate taps/Enter; close and reopen mid-submit; sign-out during hydration/write; same UUID on permitted custom fallback/retry; unknown response read-back; no duplicated optimistic/persisted row. |
| Failure behavior | Offline, invalid comment, existing and racing TMDB duplicate, at-limit bowl, metadata failure, RLS loss, unknown outcome; draft retained, no wrong-bowl add, no success on optimistic-only state. |
| UI/accessibility | One/two/five/many bowls; long and duplicate names; selected item below fold; touch/wheel/keyboard scroll; collapsed/expanded/details Escape order; focus return, inert navigation, menu closure, one dialog; filled/outline star with accessible names. |
| Regression | Search debounce/custom/microphone; recent movie-detail/pin design; login/create/invite/add/draw/return/history/manual-removal/public-link/TV flows. |

Extend existing tests in `src/hooks/__tests__/useBowl*`, MovieSearch/TopNav
component tests, Home/MyBowls/BowlSettings/dashboard screen tests, and add
provider/service/dialog integration tests. Replace last-opened behavior tests
with default/deep-link tests rather than retaining contradictory assertions.

Extend `e2e/support/fakeBackend.js` for the new context/setter RPCs, acquisition
initialization, and UUID insert/read-back behavior. Add a focused default/global
add journey and adjust existing member/history navigation expectations. Fake
backend tests do not prove RLS or database races; those require database tests.

Before release run focused tests during each step, then:

```sh
npm run test:run
npm run lint
npm run build
npm run test:e2e
```

Run pgTAP against a disposable **local** Supabase project following
[`supabase/README.md`](../../supabase/README.md). The original schema baseline
is not fully checked in: verify the real schema, UUID insert behavior, grants,
and custom-title nullability in that environment before finalizing SQL. If a
temporary baseline is needed, use only a schema export, never hosted rows;
follow the documented exact-project cleanup. This is an engineering release
gate, not an unresolved product choice or permission to change hosted data.

Manually check 320px and 390px phones, desktop, zoom, a real software keyboard,
and two signed-in sessions/devices. Open a fifth-or-later selection, scroll to
it, change a default on the other device, revoke a destination, and interrupt
an add response. Run the core release smoke in
[`STABILITY.md`](../../STABILITY.md). Record actual results; a prototype or
this plan is not evidence that the implementation passed.

## 8. Deployment and rollback

1. Deploy the additive database migration first through the normal release
   process. Verify backfill/access and existing create/join/delete operations.
   Old clients keep their existing UI and RPC signature during the transition.
2. Deploy the connected client after all gates pass. No new environment
   variables or Vercel function slot are required. Verify the build ID and
   migration on the deployed app as part of smoke testing.
3. If RPCs are missing or unavailable, expose load/retry states rather than
   silently falling back to last-opened routing or guessing an Add destination.
4. For a client regression, revert the client first and normally leave the
   additive table/functions in place, preserving users' saved choices.
5. Provide a full SQL rollback in `supabase/rollback/`: remove acquisition
   triggers before their helpers/functions and preference table. Apply it only
   after dependent clients are retired; it deliberately discards saved defaults
   but must not delete bowls, movies, memberships, or watch history.

Update the root README, Supabase README, TODO, and design status when behavior
actually ships. Voice capture and universal concurrent capacity enforcement
remain separate work; neither is required to complete this feature.

## Implementation record — August 31, 2026

Implemented locally. No hosted migration or client deployment was performed.

- Database: `20260831120000_add_user_bowl_defaults.sql`, its rollback, and
  pgTAP tests implement the storage, private helpers, public RPCs, acquisition
  triggers, shared ranking/backfill, and lazy access repair. The new foreign
  key has an index for deletion. Existing draw, pin, history, public-add and
  TV functions are unchanged.
- Client: `useUserBowls` owns account context; `BowlAddProvider` owns add
  sessions; `addBowlMovie` owns the shared write path. The dashboard subscribes
  to add events, including reconciliation when an older read overlaps a
  successful add. Last-opened routing and its storage utility were removed.
- UI: stars, Home routing, the plus/filmstrip control, the name-only dropdown,
  scrollable choices above search, inline details, repeat adds, and separate
  “Log a watched movie” action are connected. The original bowl logo remains.
- Safety: capture destination/comment/account before metadata; retain pending
  and uncertain operations on close/reopen; confirm unknown writes by UUID
  without a new insert. An uncertain operation cannot be dismissed into a
  fresh add session. Access loss retains the draft and requires a deliberate
  destination choice. Disabled controls show “Adding…” only during a real
  pending operation.

Verification completed:

| Check | Result |
| --- | --- |
| Vitest | 99 files, 749 tests passed |
| ESLint | Passed |
| Production build | Passed |
| Playwright, desktop and mobile Chromium | 32 passed, 2 existing TV-on-mobile skips; all 14 feature journeys rechecked after the final scroll correction |
| New default-bowl pgTAP suite | 30 assertions passed |
| Separate database connections | All 3 race checks passed: first acquisitions, repair versus star, star versus deletion |
| Rollback and reapply | Both succeeded locally; the 30 new assertions passed again |
| Visual/interaction checks | Reviewed 320px, 390px and desktop layouts; 320×400 short viewport; five/six choices, long duplicate names, and full selected-row visibility; inline details; repeat-add focus; Escape and invoker focus; pending close/reopen and explicit access-loss replacement |
| Real local Supabase app | Synthetic account: saved star through the real RPC, Home navigation to that choice, and the shared selector verified in the in-app browser |

Database verification used only a schema export of the linked `public`
schema plus synthetic local fixtures. No hosted rows were copied. Nine SQL
suites passed, including defaults, atomic bowl deletion, pinned movies,
provider links, and local watch dates. Four older suites failed identically
before and after this migration:

- `20260726153000_tighten_profile_and_bowl_movie_access.sql`: assertion 29,
  public-link contributor attribution count, expected 1 and received 0.
- `20260727150000_save_draw_access_atomically.sql`: direct
  `can_draw_from_bowl` call denied under its test role.
- `20260821150000_add_rotation_draw_method.sql`: assertion 18,
  participant history count, expected 8 and received 4.
- `20260822120000_add_movie_comments.sql`: assertion 14,
  participant comment snapshots, expected 2 and received 1.

These are recorded as existing baseline issues, not a green full SQL suite.
No unrelated SQL behavior or assertions were changed to hide them.

Cleanup completed: signed out the synthetic browser account, restored its
viewport, stopped the temporary Vite server, deleted the exact Supabase test
project and its volume, removed the schema export/login files, and removed
the seven newly pulled unused Supabase images. The four pre-existing Docker
images were preserved.

Release still requires deploying the migration before the client, investigating
the older SQL baseline failures, checking a physical phone's software keyboard
and independent devices, and running the deployed-app smoke checklist. Browser
viewport tests do not establish physical iOS/Android keyboard behavior.

# Known Issues and Engineering Tradeoffs

This file is the durable register for evidence-backed product defects, security
and data-integrity risks, and intentional engineering tradeoffs. `TODO.md`
remains the product and maintenance backlog; this register records why an issue
exists, what would resolve it, and what evidence should change its status.

The weekly audit should compare its findings with this file. It may propose
changes, but its read-only run must not edit the register or implement a fix.

## How to maintain this register

Statuses have specific meanings:

- **Confirmed bug** — checked-in behavior violates a stated invariant or causes
  a reproducible integrity, permission, completeness, or recovery failure.
- **Needs decision** — the risk is real, but the intended trust boundary or
  product behavior must be decided before implementation.
- **Needs production verification** — static repository evidence is incomplete;
  inspect deployed grants or data before scheduling a repair.
- **Accepted tradeoff** — intentional behavior with a recorded rationale and a
  concrete trigger for reconsidering it.
- **Fixed** — the repair has landed with regression coverage. Move the entry to
  `Resolved` and record the resolving commit and any deployment dependency.
- **False positive** — evidence disproved the finding. Move it to `Resolved` and
  retain the explanation so later audits do not rediscover it.

Severity follows the audit convention: P0 is an active critical incident, P1
risks broad or irreversible harm, P2 is a significant correctness, security, or
reliability defect, and P3 is limited hardening or polish.

When changing an entry, update `Last reviewed`, preserve its stable ID, and add
a dated decision-history note. A plan is ready for implementation only when it
covers the invariant, affected boundaries, regression tests, historical data,
and rollout or rollback.

Last reviewed: 2026-09-01 at commit `bc6b7e3`.

## Confirmed bugs

### MB-002 — Removed members can still edit their old comments and pins

- **Severity:** P2
- **Status:** Confirmed bug
- **First observed:** comments in `b2522ba`; pins in `1b0e4c6`
- **Invariant:** Losing access to a bowl must revoke mutations inside that bowl,
  even when the caller still knows a row UUID they originally created.
- **Evidence:** `update_own_bowl_movie_note` checks authentication, row
  ownership, attribution, and undrawn state but not current bowl access
  (`supabase/migrations/20260822120000_add_movie_comments.sql`, lines 44–61).
  `set_own_bowl_movie_pin` has the same omission
  (`supabase/migrations/20260829170000_add_pinned_bowl_movies.sql`, lines
  54–81). Both are `SECURITY DEFINER` RPCs granted to `authenticated`, so table
  RLS does not supply the missing boundary.

**Implementation plan**

1. Redefine both RPCs in one migration and require
   `public.is_bowl_owner(v_movie.bowl_id) OR
   public.is_bowl_member(v_movie.bowl_id)` after loading the target row. Keep the
   ownership and undrawn checks; current bowl access is an additional condition.
2. Preserve the existing generic unavailable error so the RPC does not reveal
   row existence to former members.
3. Add pgTAP cases for owner, current member, removed member, unrelated member,
   link-created row, and already-drawn row for both functions.
4. No data repair is required. Deploy the migration independently of the UI;
   rolling back means restoring the two prior definitions.

### MB-003 — An unknown add outcome can lock the global Add flow indefinitely

- **Severity:** P2
- **Status:** Fix ready; awaiting production deployment
- **First observed:** `c00b8c0`
- **Invariant:** An ambiguous network outcome must offer a safe path to confirm,
  retry, or abandon the submission without risking a duplicate movie.
- **Evidence:** A clean status read with no matching row still returns
  `outcome_unknown` (`src/lib/addBowlMovie.js`, lines 34–49). Once that result is
  present, the provider refuses destination changes and new submissions
  (`src/context/BowlAddContext.jsx`, lines 34–36, 57–59, and 72–75). Closing and
  reopening the dialog preserves the blocked operation.
- **Impact:** A request that never reached the server, or a definitively absent
  row, leaves Add unusable until the page or account state resets.

- **Repair:** `checkStatus` now separates the two outcomes it used to merge. A
  failed read stays `outcome_unknown`; a clean read of the submission's own
  primary key returns `add_not_committed`, and a row held by something else
  stays uncertain because retrying could only collide with it. An uncommitted
  add offers **Try again**, which resends the captured operation under its
  original `submissionId`, so a first write that arrives late loses the primary
  key and reconciles instead of adding a second slip.

  An unfinished add is no longer a lock. It moved out of the single result slot
  into its own `unresolved` list on the provider, so it survives dismissal and
  reopening while the rest of Add keeps working: the destination can change, a
  different title can be submitted, and reopening starts a clean session. Only a
  second attempt at the same title in the same bowl is refused, using the same
  submission key that already guards in-flight duplicates.

  Both `outcome_unknown` and `add_not_committed` count as unfinished
  (`isUnsettledAddCode`), because in either case the first write may still land.
  Neither can be dismissed, and neither releases the title until it resolves —
  otherwise the same custom title could be resent under a fresh id and both rows
  would persist, since a custom entry carries a random negative `tmdb_id` and so
  is not covered by the active-title uniqueness constraint. The two differ only
  in the control offered: Try again for one, Check add status for the other.

  A retry also has to recognize its own late-landed row. `add` now looks for a
  row carrying its `submissionId` in the undrawn read and claims it as success
  ahead of both the undrawn limit and the duplicate preflight. Neither is that
  submission's problem once it has succeeded, and its own row could be the one
  filling the bowl or the one that looks like a duplicate.

  Only a landed row releases a claim. A retry that fails before dispatch —
  offline, a dropped request — says nothing about whether the first write is
  still on its way, so the claim stands and keeps its own message while the
  transient failure shows as ordinary dismissible feedback. This is keyed on
  whether a claim already exists rather than on a list of codes, because a fresh
  offline submission never dispatched and must not be claimed.

**Verification and rollout plan**

1. Service tests cover the clean miss, a failing status read that stays
   uncertain, another account's row, a late original write colliding with a
   same-id retry without producing a second slip, and a late-landed row with a
   positive TMDB id being claimed rather than reported as a duplicate or as the
   row that filled the bowl.
2. Provider tests cover feedback dismissal that leaves the unfinished add
   standing, changing destination, submitting a different title, close/reopen,
   refusing the same title in the same bowl, and resolution by both status check
   and same-id retry — including that neither dismissal, a destination change,
   nor reopening releases the title, and that it is free again once settled.
   Banner tests cover both controls and that an unfinished add carries no
   dismiss control. A retry that fails offline is covered too: the claim stands
   with its original message and the title is still refused.
3. Deploy the client without a database migration, then confirm on a phone that
   an interrupted add offers a working retry and that Add stays usable while one
   submission is unresolved.
4. Rollback is a client revert; there is no persisted-data repair.

**Decision history:**

- 2026-09-01 — treated a clean read of the submission's own primary key as a
  definitive answer rather than an ambiguity, and made the genuinely ambiguous
  case a tracked item beside the flow instead of a lock on it.
- 2026-09-01 — review found that "not committed" had been treated as settled.
  Dismissing it, changing destination, or reopening released the title, so the
  same custom entry could go out under a fresh id and duplicate if the first
  write landed late. Both unfinished codes are now claimed until resolved, and a
  retry claims its own late-landed row ahead of duplicate handling.
- 2026-09-01 — follow-up review found two narrower versions of the same mistake.
  A failed retry was releasing the claim even though it proved nothing about the
  original write, and the undrawn limit was being enforced ahead of same-id
  reconciliation, so a delayed original that became the 500th row was reported
  as a failure. Releasing a claim now requires a landed row, and reconciliation
  runs before every check that could blame the caller for their own write.

### MB-004 — History screens and all-history export stop at the hosted row cap

- **Severity:** P2
- **Status:** Confirmed bug
- **First observed:** `2233252`
- **Invariant:** Counts and an export labeled as all history must include every
  accessible row, independent of the Supabase response-row limit.
- **Evidence:** The personal `user_watch_events` query has ordering but no
  pagination (`src/screens/WatchListPage.jsx`, lines 69–76), and the Letterboxd
  export is built from those loaded rows (lines 237–240). The bowl
  `bowl_draw_events` query is also unpaginated (`src/hooks/useBowl.js`, lines
  168–175).
- **Impact:** Once a hosted response limit is reached, history, counts, and CSV
  output silently omit older records. The exact threshold depends on deployed
  Supabase configuration.

**Implementation plan**

1. Add a shared paged-query helper with an explicit page size, stable compound
   ordering, and termination on a short page. Include a unique ID as the final
   ordering key so equal timestamps cannot skip or duplicate rows.
2. Use it for personal history and bowl draw history. Keep loading and error
   state honest if a later page fails; do not label a partial result as all
   history or enable a partial export without disclosure.
3. If rendering very large histories becomes slow, paginate or virtualize the
   UI separately. CSV generation must still request the full dataset.
4. Test two or more pages, a page-boundary timestamp tie, a later-page failure,
   deduplication, counts, and CSV row totals.
5. No schema or data repair is required. Roll back by reverting the client
   helper and call sites.

### MB-005 — Add-link label edits can report success after updating zero rows

- **Severity:** P2
- **Status:** Confirmed bug
- **First observed:** public labels in `2bb5144`; silent autosave path in
  `c3d1474`
- **Invariant:** Settings may report a label as saved only after an authorized
  row was changed.
- **Evidence:** The settings write checks only the Supabase error and then
  updates local state (`src/screens/BowlSettings.jsx`, lines 219–236). Migration
  `20260406140000_replace_add_link_revocation_with_deletion.sql` replaces the
  old link policy with a DELETE policy but does not recreate an UPDATE policy.
  Under RLS, an update that sees no rows can return no error.

**Implementation plan**

1. Decide the intended editor rule explicitly. The narrow default is the link
   creator or bowl owner, matching the delete policy.
2. Add an UPDATE policy with both `USING` and `WITH CHECK` clauses for that rule.
3. Request the updated row ID from the client write and treat a missing row as
   an authorization or stale-link failure. Refresh links instead of mutating
   local state on failure.
4. Add pgTAP coverage for creator, owner, ordinary member, former member, and
   deleted link. Add a UI integration test for a zero-row response.
5. Deploy the policy migration before relying on the new client check. Rollback
   drops the policy and restores the prior client behavior.

### MB-006 — Invite acceptance is split across two writes

- **Severity:** P2
- **Status:** Fix ready; awaiting migration deployment
- **First observed:** route in `df4c29a`; inbox path in `8cc5ae6`
- **Invariant:** Accepting an invite must atomically establish membership and
  finalize exactly that invite for the authenticated email.
- **Evidence:** Both acceptance paths insert `bowl_members` before updating
  `bowl_invites` (`src/hooks/usePendingInvites.js`, lines 91–126;
  `src/App.jsx`, lines 201–242). The route logs a finalization failure and still
  reports success. The inbox reports a partial-success error after membership
  already exists.
- **Impact:** Retries can encounter confusing duplicate membership, stale
  invites remain actionable, and the two UI paths disagree about success.

- **Repair:** `20260901120000_accept_bowl_invite_atomically.sql` adds
  `accept_bowl_invite(text)`, a `SECURITY DEFINER` function that locks the
  invite row, matches `invited_email` to `auth.email()` case-insensitively,
  inserts membership with `on conflict do nothing`, and sets
  `accepted_at = coalesce(accepted_at, now())` — all in one transaction. It is
  keyed on the invite token, which both surfaces already carry, and returns the
  bowl id. Execution is revoked from `public`/`anon` and granted only to
  `authenticated`.

  Both client paths now call `acceptBowlInvite` in `src/lib/bowlInvites.js`, and
  the two direct multi-write implementations are gone. There is no client-side
  auth pre-check left to disagree with the function.

  Retrying is deliberately harmless rather than refused, which repairs the
  partial states the old path could create: an existing member finalizes an
  outstanding invite, and an invite already marked accepted still admits the
  account it named. `coalesce` keeps the original acceptance time so a repeat
  cannot rewrite when the join happened.

- **Disclosure decision:** missing, mismatched, and other people's invites share
  one refusal message. The function bypasses RLS, so distinguishing them would
  let whoever holds a token learn that an invite exists and who it was addressed
  to. This is not a UX regression: RLS already hid the invite row from a
  non-matching account, so the route's "This invite was created for …" branch
  was unreachable for anyone but the bowl owner. The single message now names
  the wrong-account possibility explicitly, which is more useful than the
  "Invite not found or no longer valid." that case actually produced.

**Verification and rollout plan**

1. pgTAP covers grants, definer and `search_path`, an unidentified caller,
   another account's token, an unknown token, a null token, success, membership,
   finalization, a harmless repeat that neither duplicates membership nor
   rewrites the timestamp, and both partial-state repairs. All 19 assertions
   pass, run on 2026-09-01 against a disposable local project seeded from a
   schema-only export of the linked project per `supabase/README.md`, with the
   new migration applied on top. The whole checked-in suite was run the same way
   as a regression: 15 files, 389 assertions, all passing. The disposable
   project was stopped with `--no-backup` and deleted along with the export; no
   Docker images were newly pulled, so none were removed.
2. The export confirmed the two constraints the function depends on:
   `bowl_invites_token_key UNIQUE (token)`, so keying acceptance on the token
   matches at most one invite, and `bowl_members_bowl_id_user_id_key
   UNIQUE (bowl_id, user_id)`, which is what makes `on conflict do nothing`
   idempotent rather than silently wrong. It also confirmed
   `accept_bowl_invite` does not yet exist in the deployed schema.
3. JS tests cover the shared wrapper's result mapping (success, refusal,
   authentication, unexpected failure), both screens, and the token route,
   including that neither client path writes `bowl_members` any more. The
   Playwright sharing smoke still asserts membership and `accepted_at` together.
4. **Apply the migration before deploying the client** — the client calls an RPC
   that must already exist. Then accept a real invite from the inbox and from a
   token link.
5. Rollback is `supabase/rollback/20260901120000_restore_client_invite_acceptance.sql`
   moved back into `migrations/` with a fresh timestamp, and a client revert.
   Deploy the reverted client first, or acceptance has no path at all. Rows the
   function created are correct acceptances and are left alone.

**Decision history:** 2026-09-01 — keyed acceptance on the invite token both
surfaces already load rather than adding a second entry point, and chose one
uniform refusal over a diagnostic that a definer function would leak.

### MB-012 — Installed Android Add dialog leaks background scrolling and crowds results

- **Severity:** P3
- **Status:** Fix ready; awaiting production deployment and device verification
- **First observed:** September 1, 2026 in the installed Chrome app on a Samsung
  phone; background locking originated in `c00b8c0` and the inline session list
  in `515cefd`
- **Invariant:** While Global Add is open, the underlying route must remain
  inert and fixed at its original scroll position. A software keyboard must
  leave search results usable without making every session addition compete for
  the same viewport.
- **Evidence:** The deployed dialog locked only `body` overflow, which was not
  sufficient for the installed Android app; the page could scroll behind the
  modal. After more than one addition, the full session list also consumed the
  search viewport. One non-reproducible observation showed the TV activation
  screen after background scrolling, but no causal link to pairing or the Add
  dialog has been established.
- **Impact:** The visible modal and the route behind it can become inconsistent,
  and the keyboard leaves less room for useful search results. No data loss or
  duplicate write has been observed.
- **Repair:** The pending client release locks the document root, fixes the body
  in place, restores the exact scroll coordinates on close, makes the shell
  inert, and closes Add when browser navigation changes the route. It removes
  the redundant visible title, combines destination and close controls, and
  replaces the full
  inline session list with a compact count that opens a dedicated management
  view.

**Verification and rollout plan**

1. Automated dialog tests cover style restoration, shell inertness, compact
   session history, focus return, and the screen-reader title.
2. The desktop/mobile browser matrix covers document locking, scroll restoration,
   browser Back, a 320×400 keyboard-height viewport, additions, comments, and
   removals. The current suite passes 41 tests with three intentional TV skips.
3. Deploy the client without a database migration, then repeat the Samsung
   installed-app checks with the keyboard closed/open, multiple search results,
   multiple additions, background-scroll gestures, close/reopen, and browser
   Back. Separately watch for the TV activation screen; treat it as a distinct
   issue if it recurs with a reproducible route/history sequence.
4. Rollback is a client revert; there is no persisted-data repair.

**Decision history:** 2026-09-01 — repaired the reproducible scroll and viewport
problems without attributing the one-off TV activation screen to them.

## Needs a decision or production verification

### MB-007 — A modified client can steer or force a draw result

- **Severity:** P2
- **Status:** Needs decision
- **Relevant history:** ordinary draw behavior predates the current audit;
  rotation was introduced in `3764286` and later redefined in `fbc80e2` and
  `1b0e4c6`
- **Invariant to decide:** Is Movie Bowl randomness a cooperative UI promise, or
  must the database enforce the disclosed draw method against a modified
  authenticated client?
- **Evidence:** The ordinary draw RPC records the caller's chosen movie UUID
  after checking access and method (`supabase/migrations/20260823120000_use_local_watch_dates.sql`,
  lines 195–221). Rotation limits itself to caller-supplied
  `p_candidate_movie_ids` (`supabase/migrations/20260829170000_add_pinned_bowl_movies.sql`,
  lines 290–314), so a one-item candidate set can force an eligible title. The
  design promises uniform person-first/title-first selection and contributor
  turns (`output/designs/bowl-draw-methods.md`, lines 31–87).

**Decision and implementation plan**

1. Record the threat model. If all bowl members are trusted collaborators,
   document client-enforced fairness in the design and UI language. If fairness
   must resist a modified client, continue with the server-authoritative plan.
2. Define which eligibility inputs the server can verify. Rating, genre,
   runtime, undrawn state, membership, method, and pin state can be derived from
   stored data. Streaming-priority eligibility needs a trusted server-side
   representation or a deliberate fallback because the current client resolves
   provider availability.
3. Replace caller-chosen persistence with a transaction that locks the bowl,
   recomputes the allowed candidate pool, performs the configured random
   selection, and records the result. Ordinary and rotation methods should use
   the same authority boundary.
4. Test a one-item forged subset, omitted eligible rows, foreign-bowl IDs,
   changed filters, simultaneous draws, and each disclosed draw method. Include
   a statistical unit test for selection logic, while pgTAP proves authority and
   atomicity rather than randomness quality.
5. Roll out as a new RPC before removing the old signatures, then revoke old
   execute grants after supported clients have moved. Keep a rollback migration
   for the grants and definitions.

**Decision history:** 2026-08-31 — recorded as a trust-boundary decision rather
than assuming that client-side eligibility is either sufficient or defective.

### MB-008 — Queue promotion helper may be directly executable by callers

- **Severity:** P2
- **Status:** Needs production verification
- **First observed:** helper introduced in `e531e4c`, redefined in `f1c7219`
- **Invariant:** An internal `SECURITY DEFINER` maintenance helper must not be a
  public RPC unless it performs its own caller authorization.
- **Evidence:** `promote_queued_movies_for_bowl` is `SECURITY DEFINER` and has no
  caller authorization (`supabase/migrations/20260307100500_promote_queue_on_contribution_rule_updates.sql`,
  lines 3–18). The migration chain contains no explicit revoke for this
  signature. Actual exposure depends on deployed default function privileges,
  which the repository alone cannot prove.

**Verification and implementation plan**

1. In a read-only production session, inspect `proacl` and
   `has_function_privilege` for `PUBLIC`, `anon`, and `authenticated`. Record the
   result here without copying credentials or user data.
2. If executable, ship a migration that revokes all from `PUBLIC`, `anon`, and
   `authenticated`. Confirm trigger and trusted function calls still execute as
   the owning role; do not add caller checks to an internal helper merely to
   preserve an unintended public API.
3. Add pgTAP assertions for the grants and for the supported queue mutation that
   invokes promotion indirectly.
4. No historical data repair is expected. Rollback re-grants only the role that
   a verified supported caller requires.

### MB-009 — TV pairing creation has no abuse-rate control

- **Severity:** P2 before public distribution; P3 for the current validation
  harness
- **Status:** Needs decision
- **First observed:** `4c35f9b`
- **Invariant to decide:** What request volume and client provenance must the
  public pairing endpoint enforce before the TV shell is distributed?
- **Evidence:** Every unauthenticated POST performs service-role cleanup and an
  insert (`api/tv-pairing/start.js`, lines 13–52). The Android README already
  calls abuse-rate limiting a pre-publishing requirement
  (`tv-android/README.md`, line 173).

**Decision and implementation plan**

1. Keep this as a release gate while the Android shell is only a validation
   harness. Before public distribution, choose measurable per-source and global
   limits plus a response for exhausted clients.
2. Prefer enforcement at the edge or in one atomic database RPC. A database
   design should store only a privacy-conscious source hash and time bucket,
   increment atomically, reject before inserting pairing state, and expire
   counters without doing unbounded cleanup on every request.
3. Bound or move opportunistic expired-row cleanup so an attacker cannot turn
   each request into a growing delete scan.
4. Test limit boundaries, concurrent requests, source separation, retry-after
   behavior, code collision retries, and cleanup. Add operational counters or
   alerts for rejected starts and table growth.
5. Use a kill switch or generous initial threshold for rollout. Rollback can
   disable the limiter while retaining observability.

**Decision history:** 2026-08-31 — retained as an explicit pre-publication gate,
not treated as a current incident.

### MB-010 — Legacy public-add rows may have incorrect registered attribution

- **Severity:** P2 if affected rows exist
- **Status:** Needs production verification
- **First observed:** introduced by `f1a4502`; future writes corrected by
  `b2522ba`
- **Invariant:** A named public-link guest must remain a guest contributor, not
  be merged into the link creator's registered contributor bucket.
- **Evidence:** The June migration backfilled link rows to `l.created_by` and
  wrote new link rows with the creator ID
  (`supabase/migrations/20260622120000_equal_probability_contributor_draw.sql`,
  lines 53–63 and 150–174). The August function now writes `added_by = null`
  (`supabase/migrations/20260822120000_add_movie_comments.sql`, lines 175–203),
  but contains no repair for earlier rows. Contributor buckets prefer
  `added_by` over `added_by_name` (`src/utils/drawBuckets.js`, lines 25–31).

**Verification and repair plan**

1. Run read-only counts for undrawn slips and draw events written during the
   affected interval where link provenance, a guest name, and creator
   attribution are all still provable. Break down counts by whether the link or
   source slip still exists.
2. If a reliable predicate exists, write an idempotent migration that clears
   `added_by` only for proven public-link guest records and updates corresponding
   draw-event attribution consistently. Never infer guest status from a name
   alone.
3. If link deletion destroyed the evidence needed to classify some rows, report
   the ambiguous count and leave those rows unchanged unless a backup or audit
   log resolves them.
4. Add migration fixtures for named guest, unnamed guest, authenticated add,
   deleted link, and already-drawn history; assert contributor buckets before
   and after repair.
5. Take counts before and after deployment and keep the inverse updates keyed by
   captured row IDs if rollback is required.

### MB-011 — A settings save can partially commit

- **Severity:** P2
- **Status:** Needs decision
- **First observed:** `c3d1474`
- **Invariant to decide:** Does Save promise one atomic settings change, or a
  sequence of independent field saves with precise per-field status?
- **Evidence:** Bowl name, draw method, draw access, and link labels are written
  sequentially, returning on the first later failure
  (`src/screens/BowlSettings.jsx`, lines 149–239). Earlier writes remain
  committed while the form reports an overall failure.

**Decision and implementation plan**

1. If Save is one transaction, add an owner-authorized RPC for bowl name,
   method, and draw access. Treat link-label edits separately if their
   creator/owner authorization differs, and disclose that boundary in the UI.
2. If fields are independent, stop presenting one aggregate save result. Track
   dirty, saving, saved, and failed state per field; retry only failed fields and
   refresh committed values after any mixed result.
3. For either choice, solve MB-005 first so link-label success is observable.
4. Test a failure at every write position, retry after partial success, a
   concurrent settings edit, lost ownership, and stale link deletion.
5. A new RPC requires migration-first deployment. Per-field status is a
   client-only rollout. Neither option needs historical data repair.

**Decision history:** 2026-08-31 — atomicity is not assumed until the product
meaning of the Save action is confirmed.

## Accepted tradeoffs

### MB-T01 — Simultaneous provider cold misses can spend duplicate requests

- **Severity:** Accepted P2 risk
- **Status:** Accepted tradeoff
- **Introduced:** `1af44c4`
- **Behavior:** Two authorized requests for the same uncached title can both
  increment the monthly budget and fetch before either completes
  (`supabase/migrations/20260830120000_add_title_provider_links.sql`, lines
  73–91).
- **Rationale:** The provider-link design explicitly accepts two requests and
  states that the coordination lock would cost more than the request it saves
  (`output/designs/provider-deep-links.md`, lines 267–280). The global monthly
  cap remains atomic.
- **Revisit when:** Duplicate requests become visible in quota telemetry, the
  vendor cost changes materially, expected volume approaches the monthly cap,
  or a per-title lease can reuse an existing write without adding operational
  complexity.
- **If revisited:** Compare a short per-title in-flight lease, single-flight at
  the server instance, and the current design. Test crashed lease recovery and
  never let coordination return expired provider data.
- **Decision history:** 2026-08-31 — reclassified from audit finding to accepted
  tradeoff after checking the design record.

### MB-T02 — The 500-undrawn limit is not a universal concurrent hard cap

- **Severity:** Accepted P2 risk
- **Status:** Accepted tradeoff
- **Behavior:** Authenticated add uses a fresh preflight, public add has no
  universal capacity guard, and return-to-bowl uses a count before insert. Two
  concurrent writers can exceed 500.
- **Rationale:** The default/global-add implementation explicitly preserves the
  existing rule without promising an exact cross-writer cap and scopes atomic
  enforcement as separate database work
  (`output/designs/default-bowl-and-global-add-implementation.md`, lines
  248–253).
- **Revisit when:** Any bowl approaches 450 undrawn titles, public-add volume
  grows, the rotation candidate guard rejects a real bowl, or the product begins
  advertising 500 as a guaranteed hard maximum.
- **If revisited:** Serialize every add/return writer on the bowl row, enforce
  capacity inside database functions, route public consumption and authenticated
  adds through those functions, and add concurrent pgTAP or separate-connection
  tests. Plan a policy for already-over-limit bowls before deployment.
- **Decision history:** 2026-08-31 — recorded as an explicit scope tradeoff, not
  an implementation regression.

## Lower-priority watch items

### MB-W01 — Anonymous endpoints have uneven abuse controls

- **Severity:** P3
- **Status:** Needs decision
- **Scope:** TMDB proxy routes, public add-link consumption, and invite resend
  do not all have repeat-request throttles. Their anonymity or user action is
  intentional; the acceptable resource cost is not yet documented.
- **Revisit when:** Quota, email, database-write, or latency telemetry shows
  abuse; a route is promoted publicly; or service pricing changes.
- **Next step:** Inventory each route's authentication, costly side effects,
  upstream quota, current platform limits, and desired user recovery. Set
  limits per resource rather than applying one generic throttle.

## Resolved

### MB-001 — Returning an old draw erased every participant's personal history

- **Severity:** P1
- **Status:** Fixed
- **First observed:** `2233252`; reconfirmed after `b2522ba`
- **Resolved by:** `b87170b`
- **Invariant:** Returning an unwatched pick may remove the personal history rows
  generated by that draw only during a two-hour group undo window. After the
  window, every participant's personal history must remain unchanged.
- **Original evidence:** `return_bowl_draw_to_bowl` authorized one draw-capable
  caller, then deleted every `user_watch_events` row for the draw without a time
  boundary (`supabase/migrations/20260822120000_add_movie_comments.sql`).
- **Resolution:** Migration
  `20260831200000_bound_return_history_cleanup.sql` captures one transaction
  timestamp and deletes generated personal-history rows only through the
  inclusive two-hour boundary. Its rollback preserves all personal history.
  pgTAP coverage exercises recent, exact-boundary, older, edited, manual,
  unauthorized, duplicate, capacity, and repeated-return cases; phone, TV, and
  fake-backend behavior use the same contract.
- **Deployment:** The linked production migration history confirms the migration
  was applied on August 31, 2026. The deployed return flow was verified on phone
  and TV on September 1, 2026.
- **Historical data:** Records deleted before the fix cannot be reconstructed
  safely without a suitable database backup; no speculative repair was made.

**Decision history**

- August 31, 2026: put-back was defined as an unwatched-pick undo, with a
  two-hour all-participant cleanup window. Later returns preserve all personal
  history; rewatching uses the normal Add Movie flow. Full plan:
  `output/designs/tv-watch-history-details-and-safe-return.md`.
- August 31, 2026: the bounded RPC, preserve-all rollback, regression coverage,
  matching phone/TV copy, fake backend, and browse-first TV detail experience
  landed in `b87170b`.
- September 1, 2026: production migration state and deployed phone/TV behavior
  were verified, closing the issue.

# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## Implemented, pending release

- Successful TV pairing approvals now replace the code-bearing browser history
  entry and remember the approved code locally. Revisiting the original QR URL
  shows a non-actionable completed/expired state without exposing a code-status
  probing endpoint.
- The signed-in add dialog has a mobile repair ready after testing the installed
  Chrome app on a Samsung phone. Destination and close controls now share one
  compact header, session additions live behind a count that opens their own
  management view, and document-level locking prevents scrolling the app behind
  the dialog. Route changes close the dialog instead of carrying it onto an
  unrelated screen. Redeploy, then repeat the installed-app keyboard and
  background-scroll checks. Public-link and manual-history forms are unchanged.
  See the follow-up in
  `output/designs/default-bowl-and-global-add-implementation.md`.
- Default bowls and global Add are committed and pushed. Migration
  `20260831120000_add_user_bowl_defaults.sql` was applied on August 31, 2026.
  Stars, stable Home routing, the shared plus/filmstrip add dialog, explicit
  destinations, and pending/uncertain write handling are covered by tests.
  Finish the post-redeploy physical-phone and separate-device release smoke
  checks.
  See the [implementation record](output/designs/default-bowl-and-global-add-implementation.md#implementation-record--august-31-2026).

## UX / UI Polish

- TV pairing typography from physical onn. Full HD hardware: the instructional
  copy is difficult to read at viewing distance and the fallback pairing code
  is too small. Increase both, with the code getting the stronger size bump;
  keep the QR code at its current size, which tested well on the same screen.
- Theater mode controls break the cinema spell: drop "Next preview" and "Skip to
  movie" from the pre-roll overlay, keeping Pause. Neither is possible at a
  cinema, and neither is needed — Back already calls `endTheater`, so the escape
  survives unadvertised. Keep Pause both for the doorbell case and because it
  carries `data-tv-autofocus`, without which the overlay has nothing focusable.
  The "1 of 3 · Title" progress line goes too — the count is announced before
  the previews start, and on screen it only invites counting down. Pause should
  not be a button either: bind it to OK and show an indicator only while
  paused, leaving playback chrome-free. An overlay with no focusable element is
  safe — the navigation hook no-ops on an empty set, Back is a key handler
  rather than a focus target, and the reveal beneath is already `aria-hidden`
  so focus cannot fall through to it. Back during the pre-roll is verified on
  hardware — it exits from the announcement, mid-trailer, and the Feature
  Presentation card alike — so it can carry the exit alone. Removing our
  controls is only half of it — the embed shows YouTube's own, and with
  `disablekb` unset its keyboard shortcuts are live, so on a TV the D-pad seeks
  the trailer. The
  pre-roll wants `controls=0`, `disablekb=1`, `fs=0`, `iv_load_policy=3`; and
  because focus inside the iframe sends keys to YouTube's document rather than
  ours, it may swallow Back too. `getAutoplayTrailerUrl` is shared with the
  explicit "Watch trailer" action, which should keep its scrubber, so this is
  an option on the builder. On the remote tested, the D-pad never reaches
  YouTube's controls and left/right do not seek, so the params are hardening
  for remotes we do not own rather than a prerequisite — that remote has no
  transport keys, which is the vector that would bypass focus entirely. Ads get
  no detection — the IFrame API exposes no ad state and the `getDuration()`
  heuristic misfires. Whether `controls=0` hides the "Skip Ad" button is no
  longer a blocker: with Back verified, an unskippable ad costs the remaining
  previews rather than trapping the room, so ship and watch for it. Decided
  from live use; see the
  phase 1 revision in `output/designs/tv-theater-mode.md`.
- Trailer captions during the pre-roll: `cc_load_policy=0` on the embed URL in
  `getAutoplayTrailerUrl` asks YouTube not to show captions, which suits the
  cinema feel. It is a request, not a guarantee — an account that forces
  captions on still gets them — and it should be a preference defaulting to off
  rather than a hard-coded off, so hard-of-hearing viewers keep the choice.
- Offline read cache: connectivity is now detected and explained (global banner, honest error copy, draw/add refused up front, reload on reconnect), but nothing is cached, so reloading a bowl with no connection still shows an empty bowl behind the banner rather than the last known movies. Caching the last-loaded bowl read-only would close that, and needs a decision on staleness copy and invalidation before any code.
- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Streaming rank on touch: the reordering rows in User Settings still use HTML5 drag events, which do not fire on touch, so phones fall back to the ↑/↓ buttons. The redesign (`output/designs/user-settings-redesign.md`) kept that as-is; a pointer-event drag or an explicit "move to position" affordance would close it.
- Add-link delete for non-owners: Bowl Settings shows every member the Delete button on add links they did not create, and the click is refused by RLS with an error banner. Hiding or disabling it for links whose `created_by` is someone else would turn a dead-end into a readable rule — the existing test pins the current behavior, so decide the rule before changing it.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Large-bowl draw count UX: bowls over 100 lookup-eligible titles still need an explicit tap on the phone, and TV reports that the exact eligible pool needs a phone check while falling back to listing the prioritized services.
- Once-per-day draw lockout: the mobile design exploration floated "can't draw again until tomorrow" after putting a movie back, to discourage re-rolling. New product behavior with open questions (locked per user or per bowl, timezone, who can override) — needs its own design doc before any code.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Future odds-panel accuracy: before rendering `buildDrawOddsStats`, feed it the resolved eligible pool rather than `bowl.remaining`; otherwise it would show a flat 1/N for contributors the filters or streaming priority cannot reach. Separately decide whether unreachable contributors deserve a fallback that keeps them in play rather than only honest copy.

## Future Product Concepts

- Gemini-first voice capture: use an Android App Action to carry a spoken movie
  title into one confirmation screen against the authoritative default bowl.
  The disposable Gate 0 App Actions probe now lives in `android-mobile/`; its
  preview, Google Play internal build, and physical-phone invocation matrix
  still need to run with Gemini as the default assistant. Proposed product,
  architecture, safety rules, phases, and verification:
  `output/designs/gemini-voice-capture.md`.
- Bigger swings, unscheduled: attendance-aware movie nights, a live draw every
  client sees at once, shareable ticket stubs and bowl recaps, a composable
  house-rules layer over the draw method registry, and curation for bowls that
  have outgrown their own memory. Brainstorm only — no specs, no commitments.
  See `output/designs/future-ideas.md`.
- TV Theater mode: trailer pre-roll (phase 1) and provider title links with the
  voice card (phase 2) are implemented. Provider lookups default off until the
  migration and Watchmode configuration are deployed; activation instructions
  are in `README.md`. A Google TV validation harness lives in `tv-android/`;
  its provider handoff is confirmed on physical hardware for Max. Remaining
  roadmap work is LAN auto-start (no code) and making the shell store-ready. See `output/designs/tv-theater-mode.md` and
  `output/designs/provider-deep-links.md`.
- Web auto-start handoff: end the pre-roll by navigating the television to the
  feature instead of parking on the "Open [service]" button. Pure client change
  on top of phase 2's links, no bridge and no native shell, but it only reaches
  real playback where a detail URL rewrites into a watch URL — Netflix cleanly,
  most services not at all. Worth it mainly as an early answer to phase 3's
  gate: does automatic playback beat one OK press? Blocked on one unverified
  assumption: nothing in the repo knows what URL shape Watchmode really returns
  for Netflix, and confirming playback needs a signed-in browser. Settle that
  before building anything. Plan, not implementation:
  `output/designs/web-autostart-handoff.md`.
- Deterministic draw preview, steps 2 and 3: give rotation bowls a real contributor lookahead (the order is already derivable from `bowl_draw_events`, so it needs no new state), and only after living with that decide whether a committed schedule ships as a fourth draw method. A bowl-wide committed queue is blocked on filters being per-user today. Plan, not implementation: `output/designs/deterministic-draw-preview.md`.
- Personal movie ordering: let contributors rank their own undrawn titles, independently of contributor rotation. Needs a separate design for method scope, link-guest ownership, accessible reordering, and where new or returned movies land. The pinned movie shipped as the one-title version; full ordering remains a separate feature.
- Within-person title weights: let a contributor set relative odds among their own
  titles without changing anyone else's odds. Recorded in
  `output/designs/bowl-draw-methods.md`. The shipped pinned movie is its
  degenerate case and answers most of the same want with one boolean.
- One slip per person for the same title: duplicate prevention is currently per
  `(bowl_id, tmdb_id)`, so a member who wants a title someone else already added
  cannot add it and therefore cannot pin it. Letting each contributor hold their
  own slip, deduped when either is drawn, is the coherent fix — person-first
  odds are unaffected because a contributor's share is fixed at 1/N, and the
  registry table already counts duplicate slips. Open questions on pool
  double-counting and making sibling retirement visible. Analysed under
  "Edge Case: Somebody Else Already Added It" in
  `output/designs/pinned-movie.md`; needs its own design before any code.
- Solo draw: draw privately from only your own titles, in one bowl or pooled across all of them. See `output/designs/solo-draw.md`.

## Technical Debt / Maintenance

- Evidence-backed bugs, integrity risks, and accepted engineering tradeoffs are
  tracked in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md). Keep product ideas here and
  use that register for audit evidence, remediation plans, and decision history.
- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.

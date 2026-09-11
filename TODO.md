# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## Release housekeeping

- Reconcile the deployed `test-cleanup-between-renders` branch with the newer
  `main` before the next production deployment. The release branch carries the
  Node 24 pin, Supabase session coordination, daily metadata-refresh fix,
  environment-file ignore, and public-comment follow-up; `main` has since moved
  through the TV title-width and theater-ticket copy fixes. Do not redeploy
  either branch alone and accidentally drop the other side.

## UX / UI Polish

- Let a bowl owner delete entries from the bowl's watched history. Returning a
  movie is a two-hour undo, so a draw nobody watched but nobody caught in time
  now stays in the bowl's list with no way to correct it. That correction is a
  different job from putting a title back in the bowl -- it should not require
  the movie to return, since by then it may have been drawn again or removed.
  Personal entries already have this through `delete_user_watch_event`; the
  bowl-side equivalent is owner-scoped and wants a pgTAP permission test.
  Reintroducing late returns is not the answer here -- see
  `output/designs/tv-watch-history-details-and-safe-return.md`.

- TV pairing typography from physical onn. Full HD hardware: the instructional
  copy is difficult to read at viewing distance and the fallback pairing code
  is too small. Increase both, with the code getting the stronger size bump;
  keep the QR code at its current size, which tested well on the same screen.
  Reconfirmed September 9 on the clean Google Play installation; fix before the
  friends-and-family cohort.
- Public add-link comment ordering: move the comment field below movie search
  so the flow matches the signed-in Add dialog and manual-history form. Agreed
  as a small near-term follow-up, not part of the Play owner pilot.
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
- Large-bowl draw count UX: bowls over 100 lookup-eligible titles whose metadata
  the daily cron has not fully cached still need an explicit tap on the phone to
  resolve an exact eligible count. The television has no such control and says
  `Drawing from up to N` instead. Whether it should simply count is recorded as
  an accepted tradeoff in the private register rather than here, and the trigger
  for revisiting it — a television that can change its own filters — has since
  fired.
- Once-per-day draw lockout: the mobile design exploration floated "can't draw again until tomorrow" after putting a movie back, to discourage re-rolling. New product behavior with open questions (locked per user or per bowl, timezone, who can override) — needs its own design doc before any code.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Future odds-panel accuracy: before rendering `buildDrawOddsStats`, feed it the resolved eligible pool rather than `bowl.remaining`; otherwise it would show a flat 1/N for contributors the filters or streaming priority cannot reach. Separately decide whether unreachable contributors deserve a fallback that keeps them in play rather than only honest copy.

## Future Product Concepts

- Assistant voice capture: **failed feasibility gate, closed September 4,
  2026.** The Play-distributed App Actions probe could not be invoked by Gemini
  or Google Assistant, and App Actions Support confirmed that new integrations
  cannot be approved or pushed to production because the pipelines are broken.
  Do not pursue the TWA/web seam or an in-app microphone. Revisit only when
  Android AppFunctions is generally available to third-party apps with a
  supported voice invocation path. Decision record and evidence:
  `output/designs/gemini-voice-capture.md` and `android-mobile/TEST_RESULTS.md`.
- Bigger swings, unscheduled: attendance-aware movie nights, a live draw every
  client sees at once, shareable ticket stubs and bowl recaps, a composable
  house-rules layer over the draw method registry, and curation for bowls that
  have outgrown their own memory. Brainstorm only — no specs, no commitments.
  See `output/designs/future-ideas.md`.
- TV Theater mode: trailer pre-roll (phase 1) and provider title links
  (phase 2) are implemented; the voice card that shipped alongside them was
  retired once the provider launch began handing off to installed apps. Provider lookups default off until the
  migration and Watchmode configuration are deployed; activation instructions
  are in `README.md`. The Google TV shell in `tv-android/` has reached an
  owner-only Google Play internal test, and its provider handoff is confirmed
  on physical hardware for Max. Remaining roadmap work is LAN auto-start (no
  code), the Play update-retention test, and store hardening before the
  friends-and-family cohort. That path is specified in
  `output/designs/google-play-tv-private-distribution-roadmap.md`. See
  `output/designs/tv-theater-mode.md` and `output/designs/provider-deep-links.md`.
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
- Solo draw: draw privately from only your own titles, in one bowl or pooled
  across all of them. The cheap version is "solo pick" — choose from your own
  titles and write nothing to the bowl — because the shipped Watch List removal
  offer already covers the aftermath of watching alone, leaving only the picking
  as new. That version needs no migration, no RPC, and no decision about what
  other members see. See `output/designs/solo-draw.md`.
- Guest night: make sharing episodic instead of persistent. A visiting friend's
  titles join one evening's draw, the movie lands in both watch histories but
  only the host bowl's strip, and nothing permanent is created. Three separable
  features, increasing sharply in cost: an optional recently-watched draw filter
  (standalone, no guest infrastructure, no migration), a guest tossing a few
  titles in through the existing anonymous add link, and the full signed-in
  bowl merge. The history split and per-user filters already give most of the
  described behavior for free; the real open question is what
  `bowl_draw_events.source_bowl_movie_id` points at when a guest's title wins.
  Plan, not implementation: `output/designs/guest-night.md`.

- Starter packs: let an owner pour a named curated list into a bowl so a new
  bowl can reach its first draw without six people running six searches. The
  pack enters as its own contributor -- `added_by_name` already makes a non-user
  bucket a first-class contributor -- so it holds one share of the odds no
  matter how many titles it carries; attributing it to the installing member
  would drown `title_first` bowls and eat that member's rotation turn. Install a
  sample of 8-10 rather than the whole list, and skip the provider/metadata warm
  the way public add links already do: the Watchmode budget default sits exactly
  at the free plan's ceiling, and the daily cron's 300-title allowance is spent
  on distinct titles globally. Needs a `SECURITY DEFINER` install/remove pair
  with pgTAP coverage, and an answer on whether a pack takes a turn in rotation.
  Plan, not implementation: `output/designs/starter-packs.md`.

- Theater mode on the web draw: the trailer pre-roll runs only on `/tv`, but the
  toggle for it lives in the web app's "TV & playback" settings section -- so a
  laptop user can switch on a feature nothing they normally open will run. Bring
  the pre-roll to the dashboard draw, but quieter than on the television: the
  television starts previews automatically because the drawer is sitting at the
  screen they will watch on, while someone drawing on a laptop usually is not,
  so the web version should surface an affordance the viewer chooses to start
  and show nothing at all when the setting is off. No previews button on the
  bowl page for everyone; theater mode stays something you turn on in Settings.
  Note that `theaterModeEnabled` currently means "on the television," and the
  dashboard honouring it silently widens that meaning for existing accounts --
  which the offer-don't-autoplay shape is enough to absorb without a new
  preference. Specified in `output/designs/tv-web-seam.md`.

- Web/television seam: the Google TV app is the only supported television, and
  other televisions' browsers are out of scope -- in practice a path almost
  nobody can take, since Roku ships no browser and Google TV and Android TV have
  none preinstalled. The laptop is safe on `/tv` and tested there, but it is not
  where a laptop user belongs: the dashboard already draws and opens the movie,
  so the route offers them nothing except the pre-roll above. Once that lands,
  remove `TopNav`'s "TV mode" item -- and keep the `/tv` route, which the Google
  TV shell loads directly by URL. Copy about the app itself stays staged against
  the Play roadmap, with the About page speaking last. Plan, not implementation:
  `output/designs/tv-web-seam.md`.

## Technical Debt / Maintenance

- **Soon: meter the free tiers.** Nothing but `title_provider_link_usage` is
  measured, so no cost or quota question can be answered with a number. Add a
  monthly counters table in that same shape -- keyed by month, incremented
  server-side, private to the service role -- covering mail sent, TMDB calls,
  function invocations, and row growth. Give the mail path a budget and a
  warning the way provider links already have one: two things send mail
  (Supabase magic-link auth through the custom SMTP, and `api/invites/send.js`),
  the daily cap does not bind in steady state because sessions persist, and it
  binds precisely during a signup burst -- where the failure is that nobody new
  can sign in, invisibly, on the day it matters most. Also audit which kill
  switches exist (`PROVIDER_LINKS_ENABLED` does; TMDB search and signups do
  not), and verify the vendor figures listed under "Numbers To Go Check."
  Context, thresholds, and the decisions to make in advance are in
  `output/designs/scaling-and-cost.md`. The governing fact recorded there: TMDB,
  Watchmode, and Vercel Hobby all require non-commercial use, so there is a
  scale at which the free tiers are exhausted and revenue is forbidden.


- Evidence-backed bugs, integrity risks, and accepted engineering tradeoffs are
  tracked in the private `scottmttmn/movie-bowl-issues` register, not here. Keep
  product ideas in this file and use that register for audit evidence,
  remediation plans, and decision history. It is private because this repository
  is public: the schema and the policies belong in the open, since the security
  is meant to hold with them known and there are pgTAP tests asserting it, but a
  severity-rated list of unfixed defects in a deployed app is a different thing
  to publish.
- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Refresh `src/utils/providerLogos.js` before **March 2027** — it was generated
  2026-09-04, and TMDB's API terms cap caching their content at six months. Run
  `node scripts/refresh-provider-logos.mjs`, which needs `TMDB_READ_ACCESS_TOKEN`.
  A service the refresh cannot match renders as its name, so a lapse degrades
  quietly rather than breaking, which is exactly why it needs a date here.

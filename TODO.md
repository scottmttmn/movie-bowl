# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

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

- Refused trailers fall back rather than showing YouTube's wall: the player
  reports age-restricted and unembeddable videos as error 150 the moment they
  load, so every surface now tries the title's next-ranked trailer. Measured
  signed out, where 22 of the 1,000 most-voted films' picks were refused and 17
  had a playable fallback. Not yet checked: whether a browser signed in to
  YouTube reports an age wall the same way (the TV app is never signed in, so
  it behaves as tested). The films with no second trailer in TMDB at all still
  end on YouTube's message on the web and "Trailer unavailable" on the TV.

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
  on physical hardware for Max. Remaining roadmap work is the auto-start
  handoff below, the Play update-retention test, and store hardening before the
  friends-and-family cohort. That path is specified in
  `output/designs/google-play-tv-private-distribution-roadmap.md`. See
  `output/designs/tv-theater-mode.md` and `output/designs/provider-deep-links.md`.
- Theater auto-start handoff: when the pre-roll ends on its own, open the drawn
  movie with no press. The Google TV app opens the streaming app through the
  same handoff its "Open [service]" button uses; a desktop browser sends the tab
  to the provider's title page. Phones keep the button, because a timer cannot
  hand a web link to an installed app. Web-only change, no new Android build;
  fires only with a title link, and never after an exit. **Shipped; verified
  September 14, 2026 for Max on the onn Google TV box and Paramount+ on a
  desktop browser.** The checks not yet run are marked in the design.
  Actual playback (rewriting a Netflix detail URL to `/watch/<id>`) is a later,
  per-service step that needs a real Watchmode URL and a check. See
  `output/designs/theater-autostart-handoff.md`.
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
- Solo draw: draw privately from only your own titles, pooled across every bowl
  you belong to by default and narrowable to a subset. It ends the way watching
  alone already ends here — the drawn title is recorded in your watch list
  through `create_manual_watch_event`, and then the existing
  `RemoveFromBowlsModal` offers to pull it out of the bowls still holding it.
  No `bowl_draw_events` row and no `drawn_at` stamp, so nothing leaves a bowl
  except by that explicit offer, which is what keeps a pooled draw from making
  titles vanish out of bowls that had no part in the evening. No migration and
  no RPC: RLS already permits the whole cross-bowl read, and the write and the
  offer are the Watch List's own save path lifted into a shared module. It also
  owes `guest-night.md` the cross-bowl pool primitive. Open before code: whether
  the watch is written at reveal or on an explicit commitment (leaning
  commitment, so drawing again stays free), whether it needs its own
  `source_kind`, duplicate titles across bowls, and what a per-bowl pin means in
  a pooled draw. Plan, not implementation: `output/designs/solo-draw.md`.
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
  the pre-roll to the dashboard draw behind the control the television already
  has: a theater mode ticket beside the draw button, `role="switch"`, saying on
  or off before the draw rather than offering previews after it. Armed, the web
  behaves as the television does and previews start once the pick is revealed --
  the switch is the consent that earns the autostart, which an affordance
  appearing after the draw could never give. The ticket writes a per-device
  override rather than the account setting, so disarming it on a laptop cannot
  reach across and turn theater mode off on a television; a web device with
  nothing stored starts off, which is what keeps `theaterModeEnabled` from
  silently widening from "on the television" for existing accounts. Keep
  `deviceDrawSettings.js`'s storage prefix, which still says `tv`, or every
  television forgets its overrides. **Shipped September 14, 2026.** What remains
  is the rest of the design doc's sketch: rewrite the "TV & playback" settings
  copy now that the section governs two surfaces. This does put a control on the
  bowl page for everyone, reversing an earlier line in the design doc, and it is
  paid for deliberately:
  it is also the only thing that makes the feature discoverable on the web.
  Specified in `output/designs/tv-web-seam.md`.

- Web/television seam: the Google TV app is the only supported television, and
  other televisions' browsers are out of scope -- in practice a path almost
  nobody can take, since Roku ships no browser and Google TV and Android TV have
  none preinstalled. The laptop is safe on `/tv` and tested there, but it is not
  where a laptop user belongs: the dashboard already draws and opens the movie,
  so the route offers them nothing except the pre-roll above. `TopNav`'s "TV
  mode" item is gone; the `/tv` route stays, because the Google TV shell loads it
  directly by URL. Copy about the app itself stays staged against the Play
  roadmap, with the About page speaking last. Specified in
  `output/designs/tv-web-seam.md`.

## Technical Debt / Maintenance

- **Meter the free tiers — partly done.** `service_usage_counters` now records
  daily per-metric spend through `record_service_usage`, wired at the two
  chokepoints that already hold the service role: invite mail (with a warning
  at `EMAIL_DAILY_WARN_THRESHOLD`) and the daily refresh cron's TMDB claims.
  Still open: magic-link authentication mail cannot be counted from here at all,
  because Supabase's SMTP sends it after a client call that never reaches these
  functions — the vendor dashboard is authoritative for total mail, and a proxy
  signal (new profiles per day) would at least make a signup burst visible. The
  user-facing `api/tmdb/*` proxies are unmetered on purpose, to keep the
  service-role client out of routes that do not otherwise need it; revisit if
  TMDB volume ever matters. Also unstarted: auditing which kill switches exist
  (`PROVIDER_LINKS_ENABLED` does; TMDB search and signups do not), and verifying
  the vendor figures under "Numbers To Go Check" in
  `output/designs/scaling-and-cost.md`. Counter rows accumulate unbounded —
  trivial at two metrics a day, but the daily cron is the natural place to prune
  if that changes.

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
- Consider letting the YouTube channel decide what counts as official.
  `selectBestTrailer` ranks TMDB's `official` flag above cut length, so a
  studio's forty-second teaser outranks a full theatrical trailer posted by
  Movieclips whenever that upload was never flagged. The code cannot tell the
  two apart: TMDB's video rows carry no channel or uploader field. Resolving it
  costs one YouTube Data API unit per video through
  `videos.list?part=snippet&id=<key>` — not the hundred `search.list` charges —
  batched up to fifty ids, which would let an allowlist of studio and
  Fandango-family channel ids promote an unflagged upload into the official
  tier. It would have to run server-side behind `/api/tmdb/movie/details` to
  keep a second key out of the browser. Deferred deliberately: the fallback
  tiers already recover most of these titles, and nobody has counted how often
  the teaser actually wins.

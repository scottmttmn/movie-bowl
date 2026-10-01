# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- UX pass: items 01–14 are merged (#247 finishes first-run and service
  discovery), as are the reveal top-copy cleanup (#248) and the TV paper
  method slip (#249). The bowl page now counts with My Bowls' marks and shows
  the method slip too (`output/designs/ux-pass/bowl-page-marks.md`). Delight
  ideas remain proposals, each requiring its own mockup and sign-off. See
  `output/designs/ux-pass/HANDOFF.md`.

- Offline read cache: connectivity is now detected and explained (global banner, honest error copy, draw/add refused up front, reload on reconnect), but nothing is cached, so reloading a bowl with no connection still shows an empty bowl behind the banner rather than the last known movies. Caching the last-loaded bowl read-only would close that, and needs a decision on staleness copy and invalidation before any code.
- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Large-bowl draw count UX: bowls with over 100 titles the daily cron has not
  cached still need an explicit tap on the phone to resolve an exact eligible
  count. That tap stays, and it is the right shape there: a phone is on battery
  and someone is holding it. The television no longer waits for one — it has
  nobody to tap it, so it resolves the count itself. The tap is now priced by
  the titles the cache cannot answer for rather than by the whole bowl, so
  adding a movie no longer puts it back. What is left is whether the phone
  should offer to remember the answer across a session rather than asking again
  after every filter change.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Odds panel: decided against on 2026-09-19 and the unrendered `buildDrawOddsStats` removed with it. The method copy already tells people whether their picks have a real chance, and a table of shares mostly invites gaming the bowl. If one is ever built, two problems come back with it: it must be fed the resolved eligible pool rather than `bowl.remaining`, or it reports a flat 1/N for contributors the filters or streaming priority cannot reach; and rotation cannot be described honestly without the current history as well.

- Refused trailers fall back rather than showing YouTube's wall: the player
  reports age-restricted and unembeddable videos as error 150 the moment they
  load, so every surface now tries the title's next-ranked trailer. Measured
  signed out, where 22 of the 1,000 most-voted films' picks were refused and 17
  had a playable fallback. Not yet checked: whether a browser signed in to
  YouTube reports an age wall the same way (the TV app is never signed in, so
  it behaves as tested). The films with no second trailer in TMDB at all still
  end on YouTube's message on the web and "Trailer unavailable" on the TV.

- People search match rule: the People row's rule (`src/utils/peopleMatch.js`)
  shipped on its starting values -- three characters, every word a prefix of a
  name word, a popularity floor of 1.5 -- without the evaluation set
  `output/designs/search-revamp.md` asks for, because that needs authenticated
  TMDB answers. Record which queries should and should not show people (an
  exact title, a title that is also a name, same-name people, a lesser-known
  director, a large filmography) and tune the floor against them.

- Misspellings anywhere in a search: a search that finds nothing now suggests
  the closest word its trimmed last word turns up, which catches "scorcese" but
  not a typo in an earlier word or the first letters ("scrosese"). Catching those needs an
  index of our own -- popular titles and people from TMDB's daily exports under
  a `pg_trgm` index, refreshed inside the six-month cache limit -- behind a
  "Did you mean" (`output/designs/search-revamp.md`, "Misspellings").

## Future Product Concepts

- Streaming-aware search: **planned September 30, 2026; not built.** Start in
  a chosen person's filmography with an explicit **On my services first**
  control: verified subscription/free/ad-supported matches rise as a settled
  batch, while unchecked, failed, rental-only, and nonmatching titles remain
  visible. A later strict **On my services** filter uses OR semantics across
  the profile's services and ships only when the server can answer for the
  complete person/role result set; filtering today's partially enriched rows
  would create false empty states. Do not add catalog-volatility copy, and
  never remove a bowl title when its provider changes -- search informs the
  add, while draw time checks availability again. Person results are the first
  scope; ordinary title results may follow. Plan:
  `output/designs/streaming-aware-search.md`.

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
- Movie spend tracking: **planned September 30, 2026, parked while Scott thinks
  it over.** A private, per-person monthly and yearly summary of what you pay
  for rentals and subscriptions, beside how many movies you watched from each.
  It is forward-looking only: tracking starts when you turn it on, and past
  draws never count. A Rent press counts as a rental on its own, at Watchmode's
  listed price, once per title per month, with no confirm step. It lands only
  on the entry of whoever is signed in on that device, TV included. The month's
  list offers Edit price and Didn't rent, and anyone can add a rental to their
  own entry. Subscription prices are typed in; there is no price catalog. It
  never touches the draw, and nothing shows on a bowl or the TV. An optional
  rental budget comes only later, if the summary is not enough. It needs the
  rent price kept in `api/_lib/providerLinks.js` (dropped today) and a
  `watched_via` fact on `user_watch_events`, which records no service now.
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
  desktop browser.** A solo draw under automatic copy removal never reached it:
  the removed slip was the thing authorizing the provider-link lookup, so the
  reveal only ever held a search link and the handoff declined to fire. Fixed
  September 22, 2026 -- the copy the removal already keeps for undo carries the
  same claim, and authorization reads it too. The checks not yet run are marked
  in the design.
  Actual playback (rewriting a Netflix detail URL to `/watch/<id>`) is a later,
  per-service step that needs a real Watchmode URL and a check. See
  `output/designs/theater-autostart-handoff.md`.
- Rotation lookahead (optional): let a rotation bowl say who is up next --
  "Coming up: Anna, then Ben" -- as a read-only readout. The order is already
  derivable from `bowl_draw_events`, so it needs no new state, and it names
  contributors, never titles. Step 2 of `output/designs/deterministic-draw-preview.md`;
  nice to have, not scheduled.
- Decided against on 2026-09-23, so these are not coming back as proposals:
  - **Once-per-day draw lockout.** Floated to stop re-rolling after a put-back.
    The two-hour undo does not prevent that -- each new draw gets its own
    window, so a room can put picks back as often as it likes. That is accepted
    rather than solved: a re-roll happens in the room, in front of everyone, and
    each put-back truthfully says "we did not watch this." What the window does
    guarantee is that a pick which stood cannot be quietly undone later. A
    lockout would add timezone, per-person-or-bowl and override questions to
    police a choice the group is already making together.
  - **Personal movie ordering** and **within-person title weights.** Both let a
    contributor steer which of their own titles comes up. The pinned movie
    already answers the real want -- "this one next" -- with one boolean, and a
    full rank or a dial per title mostly invites tuning odds, the same reason
    the odds panel was turned down.
  - **A committed draw schedule** (step 3 of the draw-preview plan, a fourth
    draw method). It turns the draw from a reveal into a countdown, and it was
    blocked on bowl-level filters that do not exist. Rotation's lookahead above
    covers "what's coming" without committing to titles.
- One slip per person for the same title: duplicate prevention is currently per
  `(bowl_id, tmdb_id)`, so a member who wants a title someone else already added
  cannot add it and therefore cannot pin it. Letting each contributor hold their
  own slip, deduped when either is drawn, is the coherent fix — person-first
  odds are unaffected because a contributor's share is fixed at 1/N, and the
  registry table already counts duplicate slips. Open questions on pool
  double-counting and making sibling retirement visible. Analysed under
  "Edge Case: Somebody Else Already Added It" in
  `output/designs/pinned-movie.md`; needs its own design before any code.
  The add sheet's search marks already tell your slip from someone else's;
  when this lands, `ONE_SLIP_PER_TITLE` in `utils/searchMarks.js` goes false
  and someone else's copy gets its + back.
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
  bowl can reach its first draw without six people running six searches.
  **Built September 24, 2026, all four steps.** What is left is the design's
  one open question: install a pack in a real bowl and live with a few draws
  to see whether the reveal holds up. The pack's titles are
  shared slips in every person's pile, so it never takes a turn, behaves like
  any title under `title_first`, and fades as people add their own. One pack
  per bowl, at most 15 undrawn titles from it, owner-only install and removal.
  Adding a pack title claims it -- which is also how you pin one -- and rotation
  records whose turn a pack draw spent. First packs: filmographies by decade and
  Best Picture winners by decade. Installs skip the provider/metadata warm the
  way public add links do. See `output/designs/starter-packs.md`.
  **Next, decided September 27:** show the pack's undrawn titles in everyone's
  My Movies, after their own, marked by the pack's name and claimable with
  "Make it mine". Spec'd under "Pack Titles in My Movies"; not built.

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
- Watched-movie comments, not built: shared reactions a bowl can read, and a
  "how was it?" prompt some time after a draw. The two-comment split itself
  shipped; see "Two comments on a watched movie" in
  `output/designs/movie-comments.md`.

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
- Unconfirmed Playwright flake at `e2e/tv.e2e.js:552`. The
  `Put “…” back in the bowl?` dialog missed its 7500ms wait on
  `desktop-chromium` while `mobile-chromium` passed in the same run, and passed
  on re-run. No mechanism has been established, so there is nothing to fix yet —
  the line is here so a second sighting is recognised as a second rather than a
  first. Note that a sandbox with no outbound image access fails roughly ten
  specs on console-error assertions that CI passes; CI is the authority.

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

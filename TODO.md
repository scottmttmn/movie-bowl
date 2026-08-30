# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Offline read cache: connectivity is now detected and explained (global banner, honest error copy, draw/add refused up front, reload on reconnect), but nothing is cached, so reloading a bowl with no connection still shows an empty bowl behind the banner rather than the last known movies. Caching the last-loaded bowl read-only would close that, and needs a decision on staleness copy and invalidation before any code.
- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Streaming rank on touch: the reordering rows in User Settings still use HTML5 drag events, which do not fire on touch, so phones fall back to the ↑/↓ buttons. The redesign (`output/designs/user-settings-redesign.md`) kept that as-is; a pointer-event drag or an explicit "move to position" affordance would close it.
- Add-link delete for non-owners: Bowl Settings shows every member the Delete button on add links they did not create, and the click is refused by RLS with an error banner. Hiding or disabling it for links whose `created_by` is someone else would turn a dead-end into a readable rule — the existing test pins the current behavior, so decide the rule before changing it.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Large-bowl draw count UX: bowls over 100 lookup-eligible titles still need an explicit tap on the phone, and TV reports that the exact eligible pool needs a phone check while falling back to listing the prioritized services.
- Bowl dashboard hero redesign, slice 2: move the draw filters out of the inline panel into a "Narrow the draw" overlay anchored under the header (filter icon + gear top right, rose dot when active, live eligible count, Reset/Done). Slice 1 (hold-to-draw, stat line, ⓘ method info) landed. See `output/designs/bowl-dashboard-hero.md`.
- Retire draw filter defaults: the `/settings` section exists only to prefill the dashboard's filter panel, which forgets its state on unmount. Making the panel autosave back to `profiles.default_draw_settings` removes the second editor, kills the action-at-a-distance failure (filters set weeks ago on another screen emptying tonight's pool), and needs no migration — same column, same shape, TV read path untouched. Plan, not implementation: `output/designs/retire-draw-filter-defaults.md`.
- Once-per-day draw lockout: the mobile design exploration floated "can't draw again until tomorrow" after putting a movie back, to discourage re-rolling. New product behavior with open questions (locked per user or per bowl, timezone, who can override) — needs its own design doc before any code.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Future odds-panel accuracy: before rendering `buildDrawOddsStats`, feed it the resolved eligible pool rather than `bowl.remaining`; otherwise it would show a flat 1/N for contributors the filters or streaming priority cannot reach. Separately decide whether unreachable contributors deserve a fallback that keeps them in play rather than only honest copy.

## Future Product Concepts

- Bigger swings, unscheduled: attendance-aware movie nights, a live draw
  every client sees at once, treating one bowl as the unit so adding can go
  global (and voice capture becomes possible), shareable ticket stubs and bowl
  recaps, a composable house-rules layer over the draw method registry, and
  curation for bowls that have outgrown their own memory. Brainstorm only — no
  specs, no commitments. See `output/designs/future-ideas.md`.
- Movie comments: let contributors optionally record why a movie belongs in
  the bowl, then reveal that context with the draw and retain it in watched
  details and manual history. Implementation-ready plan in
  `output/designs/movie-comments.md`.
- TV Theater mode: trailer pre-roll (phase 1) is implemented, and previews now rank through the draw's own resolved pool so they lead with titles that could actually come up next. Remaining phases cover provider deep links, LAN auto-start, and a native TV shell. See `output/designs/tv-theater-mode.md`.
- Provider deep links (theater mode phase 2): replace the provider *search* URL
  the handoff opens today with a direct title URL, and add the spoken assistant
  command to the TV reveal. Web only, and it improves the phone as much as the
  TV, so it stands alone from theater mode; phases 3 and 4 both need its data.
  Implementation-ready plan in `output/designs/provider-deep-links.md`.
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

- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.

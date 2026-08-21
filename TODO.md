# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Large-bowl draw count UX: bowls over 100 lookup-eligible titles still need an explicit tap on the phone, and TV reports that the exact eligible pool needs a phone check while falling back to listing the prioritized services.
- Bowl dashboard hero redesign, slice 2: move the draw filters out of the inline panel into a "Narrow the draw" overlay anchored under the header (filter icon + gear top right, rose dot when active, live eligible count, Reset/Done). Slice 1 (hold-to-draw, stat line, ⓘ method info) landed. See `output/designs/bowl-dashboard-hero.md`.
- Once-per-day draw lockout: the mobile design exploration floated "can't draw again until tomorrow" after putting a movie back, to discourage re-rolling. New product behavior with open questions (locked per user or per bowl, timezone, who can override) — needs its own design doc before any code.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Future odds-panel accuracy: before rendering `buildDrawOddsStats`, feed it the resolved eligible pool rather than `bowl.remaining`; otherwise it would show a flat 1/N for contributors the filters or streaming priority cannot reach. Separately decide whether unreachable contributors deserve a fallback that keeps them in play rather than only honest copy.

## Future Product Concepts

- Movie comments: let contributors optionally record why a movie belongs in
  the bowl, then reveal that context with the draw and retain it in watched
  details and manual history. Implementation-ready plan in
  `output/designs/movie-comments.md`.
- TV Theater mode: trailer pre-roll (phase 1) is implemented. Remaining phases cover provider deep links, LAN auto-start, and a native TV shell. See `output/designs/tv-theater-mode.md`.
- Personal movie ordering: let contributors rank their own undrawn titles, independently of contributor rotation. Needs a separate design for method scope, link-guest ownership, accessible reordering, and where new or returned movies land.
- Within-person title weights: let a contributor set relative odds among their own titles without changing anyone else's odds. Recorded in `output/designs/bowl-draw-methods.md`.
- Solo draw: draw privately from only your own titles, in one bowl or pooled across all of them. See `output/designs/solo-draw.md`.

## Technical Debt / Maintenance

- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

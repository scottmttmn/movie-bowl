# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Streaming match count follow-ups: the count reports titles on your services, not the eventual draw pool. The rating/genre/runtime side of that gap is now covered by the separate "Drawing from N" chip, but the two chips still model different stages of the same pipeline and neither reports their intersection — with streaming priority on, the real pool is smaller than either number. Worth deciding whether they should merge into one readout. Bowls over 100 lookup-eligible titles still need an explicit tap on the phone, and TV falls back to listing services instead.
- Watched-outside-the-bowl removals leave no trace: logging a manual watch can now pull your own undrawn slips out of the bowls holding them, but that is a hard delete, so the other members just see the bowl shrink. Everything else in the history model keeps the fact (draw events are immutable, returns set `returned_at`). Worth deciding whether this should be an event the bowl can show instead.
- Person-first odds vs. the filtered pool: rating, genre, and runtime exclusions are now reported — the draw pool chip counts the people the pool can still reach and `DrawMethodDisclosure` names who is shut out and qualifies the equal-odds promise. Two gaps remain. Streaming priority is the sharpest and is still unmodeled: with service rank on only the top-ranked matching service survives, and custom titles carry a negative `tmdb_id` so they never match any service at all, so one match from one person can keep everyone else out without the readout noticing. And `buildDrawOddsStats` still derives from `bowl.remaining`, so if an odds panel is ever rendered it will show a flat 1/N for someone the draw cannot reach — it should take the filtered pool. Still undecided whether unreachable contributors deserve a fallback that keeps them in play rather than only honest copy.

## Future Product Concepts

- TV Theater mode: trailer pre-roll (phase 1) is implemented. Remaining phases cover provider deep links, LAN auto-start, and a native TV shell. See `output/designs/tv-theater-mode.md`.
- Selectable draw methods: person-first and title-first ship as an owner-controlled bowl setting. Rotation (phase 2) still needs a per-contributor last-drawn source. See `output/designs/bowl-draw-methods.md`.
- Within-person title weights: let a contributor set relative odds among their own titles without changing anyone else's odds. Recorded in `output/designs/bowl-draw-methods.md`.
- Solo draw: draw privately from only your own titles, in one bowl or pooled across all of them. See `output/designs/solo-draw.md`.

## Technical Debt / Maintenance

- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

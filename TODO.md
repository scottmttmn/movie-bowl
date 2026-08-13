# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.

## Future Product Concepts

- TV Theater mode: trailer pre-roll (phase 1) is implemented. Remaining phases cover provider deep links, LAN auto-start, and a native TV shell. See `output/designs/tv-theater-mode.md`.
- Selectable draw methods: person-first and title-first ship as an owner-controlled bowl setting. Rotation (phase 2) still needs a per-contributor last-drawn source. See `output/designs/bowl-draw-methods.md`.
- Within-person title weights: let a contributor set relative odds among their own titles without changing anyone else's odds. Recorded in `output/designs/bowl-draw-methods.md`.
- Solo draw: draw privately from only your own titles, in one bowl or pooled across all of them. See `output/designs/solo-draw.md`.

## Technical Debt / Maintenance

- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

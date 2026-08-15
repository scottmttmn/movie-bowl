# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Invite inbox polish: state handling for accepted, declined, and stale invites. Visibility is covered by the top nav badge and `/invites` page.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.
- Streaming match count follow-ups: the count reports titles on your services, not the eventual draw pool — rating, genre, and runtime filters narrow it further and are not modeled. Bowls over 100 lookup-eligible titles need an explicit tap on the phone, and TV falls back to listing services instead.
- Person-first odds vs. the filtered pool: equal weighting applies to whoever survives filtering, but the odds panel is built from `bowl.remaining` alone, so it still shows a flat 1/N for someone the draw cannot reach. Streaming priority is the sharpest case — with service rank on, only the top-ranked matching service survives, and custom titles carry a negative `tmdb_id` so they never match any service at all. The fallbacks are all-or-nothing: one match from one person keeps everyone else out. Undecided whether the fix is a per-draw odds preview, a fallback that keeps unrepresented contributors in play, or just honest copy.

## Future Product Concepts

- TV Theater mode: trailer pre-roll (phase 1) is implemented. Remaining phases cover provider deep links, LAN auto-start, and a native TV shell. See `output/designs/tv-theater-mode.md`.
- Selectable draw methods: person-first and title-first ship as an owner-controlled bowl setting. Rotation (phase 2) still needs a per-contributor last-drawn source. See `output/designs/bowl-draw-methods.md`.
- Within-person title weights: let a contributor set relative odds among their own titles without changing anyone else's odds. Recorded in `output/designs/bowl-draw-methods.md`.
- Solo draw: draw privately from only your own titles, in one bowl or pooled across all of them. See `output/designs/solo-draw.md`.

## Technical Debt / Maintenance

- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## UX / UI Polish

- Invite inbox polish: improve visibility and state handling for accepted, declined, and stale invites.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.

## Technical Debt / Maintenance

- Cross-device Roku expectations: decide whether Roku selection should remain local-only or ever become account-level.
- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

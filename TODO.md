# TODO

Lightweight backlog for product ideas, UI follow-ups, and technical maintenance.

## Product Ideas

- Allow users to reprioritize pending queue items in My Movies. Keep current FIFO behavior for now because the queue primarily acts as a memory aid, and users can still delete/re-add if they need a different order.

## UX / UI Polish

- Invite inbox polish: improve visibility and state handling for accepted, declined, and stale invites.
- Queue UX follow-up: revisit whether pending items need stronger affordances beyond color treatment.
- Draw filter UX follow-up: keep evaluating whether runtime, genre, and rating controls still feel too dense after recent cleanup.
- Visual consistency sweep: audit remaining non-core pages and components for raw styling that bypasses shared tokens.

## Technical Debt / Maintenance

- Cross-device Roku expectations: decide whether Roku selection should remain local-only or ever become account-level.
- Supabase schema/process hygiene: keep migrations and policy snapshots current so dashboard-only DB changes do not drift from the repo.
- Asset optimization: compress or replace large illustration assets that add unnecessary weight to the build.

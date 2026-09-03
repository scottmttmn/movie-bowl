# Draw readout copy reduction — rolled back

Status: reverted on September 3, 2026. The intent still stands; this records what
was undone, why, and what was learned so it does not have to be rediscovered.

## What was reverted

PR #57, "Say the draw readout in one clause" (`420b418`), the only commit on
`main` after PR #56. The revert restores the tree byte-for-byte to `18c968c`.

It changed two surfaces:

- **`BowlStatLine`** collapsed to a single clause — `Drawing from 4 on Max`
  instead of `4 of 88 eligible · 1 of 2 people represented · Favoring 4 on Max`.
- **`DrawMethodInfoModal`** became ordered steps instead of a paragraph, which
  meant `drawMethods` traded `disclosure` prose for a `steps` array.

## Why

Not because the direction was wrong. The goal — as little visible copy as the
interface can carry — still holds. It was rolled back to get to a clean base:
the change rewrote roughly 33 test assertions across six files, and two
follow-on branches exist only to repair things it disturbed. Starting again from
a settled `main` is cheaper than continuing to patch forward.

## Worth keeping from it

- **The stat line printed the same number twice.** With streaming priority on,
  the eligible count and the service tally are the same figure: the pool *is*
  the titles on the top-ranked service. Any future attempt should collapse that
  duplication rather than shorten both halves.
- **Two segments carried signal that copy alone did not.** An empty pool and
  "priority is on but matching nothing" both need to remain distinguishable;
  the reverted version carried the second as tone rather than a sentence.
- **`Check your services` can only appear when prioritization is off**, because
  the hook behind it is disabled when it is on. Off is also the state whose
  streaming readout the change removed, so the action became unreachable in
  effect — it scanned and then had nothing to show. Any redesign has to decide
  what that button is for.
- **The method dialog reads better as steps than prose.** Putting pins under
  step two shows that pinning cannot change who is selected, instead of
  asserting it in a fourth sentence.

## Where the work still lives

- `codex/less-copy-draw-readouts` — the reverted change itself.
- `codex/drop-dead-service-scan` — removes the orphaned `Check your services`
  action. Only meaningful on top of the reverted change; moot against this base.
- `codex/deflake-async-assertions` — unrelated to the copy work. It raises
  Testing Library's 1000ms `asyncUtilTimeout` and fixes two racy assertions.
  Worth revisiting on its own terms, but note it accidentally tracks
  `.vitest/last-run.json`, which should be gitignored rather than committed.

## Unfinished business it surfaced

The suite flakes intermittently under its two-worker parallelism — five
different files observed failing across many runs, never reproducible in
isolation. The cause is a class rather than a bug: assertions on state derived
from chained async work, with waits that are too short or absent. That predates
this change and outlived the revert.

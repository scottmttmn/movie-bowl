# Draw readout copy reduction — rolled back, then reinstated

Status: reverted September 3, 2026, then reinstated the same day with the defect
that prompted the rollback fixed. Kept as the record of the round trip.

## What the change does

- **`BowlStatLine`** says the draw in one clause — `Drawing from 4 on Max`
  rather than `4 of 88 eligible · 1 of 2 people represented · Favoring 4 on Max`.
- **`DrawMethodInfoModal`** renders ordered steps instead of a paragraph, so
  `drawMethods` carries a `steps` array rather than `disclosure` prose.

## Why it was rolled back, and what changed on the way back

The first attempt (#57) left `Check your services` stranded. That action can only
appear when streaming prioritization is **off**, because the hook behind it is
disabled when it is on — and off is precisely the state whose streaming readout
the change removed. Tapping it scanned, resolved, and then had nothing to show.

Reinstating it therefore also removes that action, and with it the lazy-scan
path: `useBowlStreamingMatches` had no other caller. `STREAMING_MATCH_STATUS`
moved to `streamingMatchSummary`, beside the copy it pairs with, because TV
derives that status itself and still needs the vocabulary.

Prioritization off means streaming narrows nothing, so there is nothing to check
for. Turning it on is reached through the filters panel, which is where the
decision belongs.

## What the readout must keep saying

Compressing this line twice has shown which parts are load-bearing:

- **The eligible count and the streaming tally are one number.** With priority
  on, the pool *is* the titles on the top-ranked service. Printing both was the
  same figure twice.
- **An empty pool and a fallback are different states.** `Nothing to draw` for
  the first; for the second — priority engaged, nothing matching — the count is
  honest but the tone warns, so a preference that is on and changing nothing
  does not look settled.
- **Excluded contributors keep their own segment**, as a ratio behind a glyph.
  It is the one fact here that should make someone stop.
- **The method dialog reads better as steps than prose.** Pins under step two
  show that pinning cannot change who is selected, rather than asserting it in
  a fourth sentence.

## Unfinished business it surfaced

The suite flakes under its two-worker parallelism — several files, never
reproducible in isolation, caused by assertions on state derived from chained
async work. Partly mitigated by raising `asyncUtilTimeout` and `testTimeout`
together; roughly one run in ten still fails. That predates this work and
outlived both the rollback and the reinstatement.

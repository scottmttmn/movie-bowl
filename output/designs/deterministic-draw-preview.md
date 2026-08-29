# Deterministic Draw Preview

Status: step 1 shipped; steps 2 and 3 are a plan, not an implementation. Nothing
below step 1 exists in code.

## The Question

Theater mode plays trailers from the bowl before the feature. Those trailers are
sold to the room as previews of movie nights to come, but the draw is random, so
nothing is genuinely "coming up" — the pre-roll is a sampler of the bowl, not a
schedule.

The obvious fix is to make the bowl deterministic: commit to the next ten picks,
still check filters at draw time, and let theater mode show what is actually
next. This document works through why the committed queue is the last step
rather than the first, and what delivers most of the value before it.

## What Makes a Committed Queue Hard

### The eligible pool is a property of the drawer, not the bowl

Rating, genre, runtime, and streaming priority live in the drawing user's
profile draw settings (`utils/drawSettings.js`, loaded by
`useUserStreamingServices`), and streaming priority narrows against that user's
saved services. Two members of the same bowl resolve different pools from the
same rows.

So there is no single correct "next ten" for a bowl. A queue persisted
bowl-wide is right for whoever generated it and wrong for whoever draws next
from a phone. Any committed queue has to either move the filters to bowl-level
settings or accept that it is per-user, at which point the TV's previews are
only honest for the account signed in on that TV.

### Skipping quietly breaks the fairness promise

Generate ten picks under person-first, then at draw time the head fails the
filters and the draw advances to the second entry. That entry belongs to
whoever happened to land second in a list generated under different conditions.
The result is no longer person-first — it is person-first conditioned on
filter-survival order — and `PERSON_FIRST.disclosure` in `utils/drawMethods.js`,
which the app renders verbatim as a product promise, becomes false.

The honest repair is to re-run selection whenever the head is ineligible. That
makes the queue advisory rather than deterministic, which returns the previews
to being maybe-accurate — the problem we started with.

### New titles cannot get in

A movie added tonight is locked out for the length of the queue. In a bowl that
draws weekly, ten committed picks is two and a half months. Any splice rule
that fixes this reopens the fairness question, because splicing is a second
selection procedure operating on the first one's output.

## Step 1 — Previews resolve through the draw's own pool (SHIPPED)

`TvTonightScreen` built its trailer candidates from `bowl.remaining` — the whole
undrawn bowl, no filters applied — so the pre-roll could show a movie the
current settings would never have drawn.

It now resolves the pool through `getResolvedDrawPool`, the same shared
resolver the draw runs, and hands the surviving ids to `buildTrailerQueue`.
Previews lead with titles that could genuinely come up next; the rest of the
bowl only backfills. This delivers most of the felt goal — every preview is a
real candidate — with no new persistence, no schema, and no change to selection.

Implementation notes:

- `theaterQueue.js` ranks candidates on two preferences that can disagree.
  Eligibility outranks repeat-avoidance: a title the draw cannot reach is not a
  preview of anything, while a repeat is a small loss of novelty. The four
  ranks are eligible-fresh, eligible-repeat, other-fresh, other-repeat.
- An empty resolved pool falls back to the whole bowl rather than dropping the
  pre-roll, which keeps the design principle above ("*prefer* trailers from
  movies that remain eligible") literally true.
- Resolution is normally free: the rating and provider caches are warm from the
  draw that just committed, and the post-draw pool is a subset of what that
  draw already resolved.
- The resolver inputs are held in refs, matching `useDrawPoolCount`, so a
  fetcher identity settling underneath the screen cannot rebuild a queue that
  is already playing.

## Step 2 — Real lookahead for rotation bowls

Rotation already has deterministic lookahead and does not know it.
`draw_bowl_movie_by_rotation` picks the contributor bucket with the oldest
`max(drawn_at)` in `bowl_draw_events`, ties broken randomly, then a random title
within that bucket. Every input is readable by the client: bucket keys from
`bowl_movies`, last-drawn timestamps from `bowl_draw_events`.

So a rotation bowl can say, truthfully and with no new state, "Coming up: Anna,
then Ben, then Cara" — and pull previews from those contributors' eligible
titles. The person is deterministic; only the title within is random.

Design constraints:

- Frame it at the contributor level, never as "this exact movie is next."
- Ties break randomly server-side, so a tied lookahead is a set, not an order.
  Show the tied names together or stop the list at the tie.
- A filter can remove every title someone added, dropping them out of the pool
  entirely. The lookahead must be computed against the resolved pool from step
  1, and it inherits the `reachCaveat` copy already on the rotation method.
- The lookahead is a readout, not a commitment. It must not be passed to
  `draw_bowl_movie_by_rotation` as a candidate order — the database owns that
  choice precisely so two devices cannot award the same turn twice.

This is the best value-per-risk of the three steps for a bowl already on
rotation, and it strengthens the method's product story rather than adding a
parallel one.

## Step 3 — A scheduled draw method

Only if steps 1 and 2 have been lived with and title-level determinism is still
wanted. It ships as a fourth entry in the `utils/drawMethods.js` registry, not
as a change to how bowls work.

- `selectionMode: "server_queue"`, owner-selected exactly like rotation, with
  its own `label`, `description`, and `disclosure` — the last stating plainly
  that the bowl commits to the next N titles and that everyone can see what is
  coming. Person-first stays the default and stays untouched.
- `normalizeDrawMethod` already falls back to the default for an unrecognized
  value, so a bowl switched to the new method cannot break an older cached
  client.
- Storage: a `bowl_draw_schedule` table (bowl_id, position, bowl_movie_id,
  generated_at) written and consumed inside the same bowl-row lock the rotation
  RPC takes, so a phone and a TV cannot consume one slot twice. Do **not** reuse
  `bowl_movie_queue` — it is the legacy per-user contribution queue and the name
  will mislead every future reader.
- Ineligible head: leave it in place and draw the first eligible entry below it.
  Consuming a skipped entry would make "these are coming" false the first time a
  filter moved.
- New additions: regenerate the tail past position three, leaving a short
  committed head. That bounds the lockout to about three draws while keeping the
  previews stable across a movie night.
- Generation is per-bowl and therefore needs bowl-level filters, or an explicit
  decision that the schedule is generated under the owner's settings and the
  previews carry that caveat. This is the open question that gates the step.

## The Real Trade

A committed queue that theater mode displays is a published schedule. The draw
stops being a reveal and becomes a countdown. That is a legitimate product —
some groups would rather know what is next — but it is a different one, which is
the strongest argument for step 3 being an opt-in method rather than a change to
what a Movie Bowl draw is.

## Open Questions

- Do people want to know what is coming, or does knowing spoil the draw? Step 1
  is a cheap way to ask: it makes the previews real without making them a
  promise.
- Should the rotation lookahead appear on the phone dashboard too, or only in
  theater mode where the previews motivate it?
- If step 3 ships, does a scheduled bowl still animate a draw, or does it
  reveal the committed pick directly?

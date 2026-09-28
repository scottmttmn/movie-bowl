# Draw Method Reveals

Status: step 1 built September 27, 2026 on the web bowl dashboard, and replaced
by step 2 on September 28 (`src/utils/drawReveal.js`,
`src/components/DrawRevealStage.jsx`). Step 3, the television, is a plan and
nothing of it exists in code.

## The Question

Every draw method used to play the same animation: the bowl shakes and a slip
pops out with the title on it. The method -- the thing that decides whether
adding ten movies buys ten chances or none -- was explained only in Bowl
Settings and the method info modal, which is to say nowhere anyone is looking
at the moment they wonder whether the draw was fair.

The draw itself is the natural place to show it. Person-first is two choices, a
person and then one of their movies; rotation is the same two with the first one
decided rather than rolled; title-first is one choice from everything. An
animation that plays those stages says the method without a sentence about odds.

## The Rule: Replay, Never Perform

An animation that explains the method is making a claim, so it has to be true.
If person-first sweeps a row of names and lands on Sam, and the title then turns
out to come from Alex's pile, the animation has broken the promise it was meant
to make legible.

So the reveal is a replay of the draw that already happened, built from the
resolved pool and the persisted result:

- While the request is in flight the track only says what the method is doing
  ("Picking a person at random…"). It never cycles names it does not yet have,
  and never lands on anything.
- When the result arrives, `useBowl.handleDraw` returns a `drawReveal` built by
  `getDrawReveal` from the same pool the method selected from. Person-first
  reports the turn it spent (`turnBucketKey`); rotation's turn is the drawn
  slip's contributor.
- A stage the client cannot verify is left out, not guessed. Rotation's
  database does not say whose turn a starter pack slip spent, so that reveal
  has no person stage and says only "From the starter pack".
- A stage the method does not have is never shown. Title-first has no person
  stage at all, and leaving it out is itself the explanation.

## The Stages (step 1)

| Method | Person stage | Title stage |
|---|---|---|
| Person-first | The row of people, one chip each however many titles they added, swept at least once and slowing onto the drawn person | "1 of Sam's 4 movies", or "Sam's pinned movie" |
| Rotation | The same row, dimmed; the person whose turn it is steps forward with no sweep, because nothing about it was random | Same as person-first |
| Title-first | none | "1 of 23 movies in the bowl" |

Also:

- One person in the eligible pool: no person stage. A spin with one name is
  drama, not information.
- A pinned pick lands as the pin, with no shuffle, which shows the pin being
  honoured without saying so. Title-first never shows one: pins do nothing there.
- Nobody owns an eligible title, so the pack is the draw: no person stage.
- More than eight people: the chosen person is always kept, the rest trimmed,
  with a "+N" chip.
- The copy describes what happened, never the odds. Odds belong to the method's
  registry copy in `utils/drawMethods.js`, which also owns each method's
  in-flight line (`revealPending`).

## Step 2 — The Takeover (built September 28)

Step 1 narrated the method in a row of small chips under the bowl, inside the
1.5 seconds the draw always took. It was true and easy to miss. Step 2 gives the
draw the whole screen and about four and a half seconds, and turns each method
into something that happens to the slips.

`DrawRevealStage` is portaled to the body and lifts the dashboard's bowl out of
the page onto a dark stage. The method's steps sit across the top as numbered
pills, read from the registry's `steps`, and light up as each stage lands.

| Method | While in flight (claims nothing) | Once the result is in |
|---|---|---|
| Person-first | Slips rise and sort into one pile per person. Piles are as tall as what each person added; every name tag is the same size. A light sweeps the tags. | The sweep slows onto the drawn person (at least one lap), the other piles drop back, theirs fans, one slip lifts and unfolds. |
| Rotation | The same piles, on ticket stubs. No sweep. | The piles line up in the order the draw ranked them ("Never drawn", "2nd in line"), the turn steps forward, then the same fan and lift. |
| Title-first | Every slip rises as one crowd, "14 movies", swirling while a light flickers between slips. | The flicker slows onto one slip, which is pulled forward and unfolds. |

A pinned pick lifts straight off the top of the pile, with its pin showing,
instead of fanning. One person, a pack-only pool, or a result with no person
stage plays as the crowd. Past eight people the rest share a "+N" pile, whose tag
names the drawn person when that pile is the one drawn.

### What may play before the result

This relaxes step 1's rule that the reveal "never cycles names it does not yet
have". The pool is resolved before the request goes out, so `handleDraw` hands
it to `onPoolResolved` first, and the stage may rise, sort and sweep over real
names while the draw is in flight. What it may not do is land: every stage that
settles on someone starts no earlier than the result. The replay rule is
unchanged; only the waiting got louder.

### Rotation's queue

The line-up needs the order the draw actually used, and the client cannot
rebuild it: returned and removed draws still count for rotation and are hidden
from every watched list. So `draw_bowl_movie_by_rotation` now also returns
`turn_bucket_key` and `rotation_queue`, the eligible people in the order its
locked transaction ranked them, each with a `never_drawn` flag
(`20260928120000_return_rotation_queue.sql`). It carries order and never dates,
because a date would surface a draw its owner removed from the bowl's history. A
queue that does not put the drawn person first, or does not match the pool, is
dropped and the turn simply steps forward. Returning the turn also means a
rotation pack slip now has a person stage.

### Timing

`getDrawRevealTimeline` is the one schedule. The stage plays it; the dashboard
opens the movie when it ends. With a quick result, person-first and rotation
open at about 4.95 s, a pinned pick at 4.55 s and title-first at 4.1 s. A slow
result spends its wait on the in-flight stages and lands one sweep after it
arrives. A result with no reveal opens as before, at 1.5 s.

With reduced motion nothing flies or sweeps; every stage still appears, in
place, and the movie opens in about two seconds.

### Accessibility

The stage is `aria-hidden`. The draw's polite live status speaks each stage as
the stage lands ("Sam, at random." then "1 of Sam's 4 movies."), never before
the animation has shown it.

## Step 3 — The Television (not built)

The television is where this matters most -- the whole room watches the draw
together -- and it already receives `drawReveal` from the same `handleDraw`.
What is left is `TvDrawingScreen`: a ten-foot version of the stage, driven by
the same `getDrawRevealTimeline`, in `TvTonightScreen`'s draw, which has its own minimum delay and
theater hand-off. `TvDrawMethodMark` already names the method beside the bowl
name; the reveal would be where it shows it working.

## Still Open

- Whether four and a half seconds still feels like an event on the fifth draw
  of a night, or wants a tap to skip.
- Solo draw has no method and keeps the plain animation; `TODO.md` has the
  follow-up to give it the crowd.

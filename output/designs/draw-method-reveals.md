# Draw Method Reveals

Status: step 1 built September 27, 2026 on the web bowl dashboard
(`src/utils/drawReveal.js`, `src/components/DrawRevealTrack.jsx`). Step 2, the
television, is a plan and nothing of it exists in code.

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

## The Stages

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

## Timing

The draw used to open its result 1.5 seconds after the hold completed, however
fast the request came back. The reveal keeps that: once the result is in, the
person stage runs 800 ms, the title goes on the slip, and it holds for 500 ms.
A draw that returns in the first 200 ms still opens at 1.5 s. A slow one gets
the stages after its result rather than skipping them, so it opens up to 1.3 s
after the request returns.

With reduced motion there is no sweep: the person stage lands after a short
pause and the chips do not move.

## Accessibility

The track is decorative (`aria-hidden`). The same account is appended to the
draw's polite live status ("Sam, at random. 1 of Sam's 4 movies."), so a screen
reader hears the stages the animation shows.

## Step 2 — The Television (not built)

The television is where this matters most -- the whole room watches the draw
together -- and it already receives `drawReveal` from the same `handleDraw`.
What is left is `TvDrawingScreen`: a ten-foot version of the row and the same
sequencing in `TvTonightScreen`'s draw, which has its own minimum delay and
theater hand-off. `TvDrawMethodMark` already names the method beside the bowl
name; the reveal would be where it shows it working.

## Still Open

- Whether 800 ms is long enough for a sweep across eight names to read as a
  pick rather than a flicker, in a real bowl on a phone.
- Solo draw has no method and keeps the plain animation.

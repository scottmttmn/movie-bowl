# TV Solo Draw

Status: implemented September 16, 2026; scope and streaming brought onto
the screen behind the pool line the same day.

The TV now offers solo draw from the bowl picker at `/tv/solo`. It uses the
same private, committed selection as the web flow: only titles added by the
signed-in person are eligible, duplicate TMDB titles get one chance, eligible
pins narrow the pool, the shared bowl copies are untouched, and the result is
written to personal Watch History before it is revealed.

## Design decision: one quiet stage

The imported TV exploration tried to put the whole web page on a television.
It repeated the solo identity in the header and stage, exposed every bowl as a
scope chip, showed the full streaming-priority rail, explained the draw in two
separate readouts, and added a recent-history strip. From across a room, all of
that competed with the only action that mattered.

The production screen keeps four things:

- a short statement of what solo draw does;
- one dominant `Draw for myself` target;
- a quiet line reporting the pool; and
- the theater ticket, because it changes what happens immediately after this
  draw and is therefore a decision for the room.

The screen still does not offer filter editing, identity badges, or history
browsing on the stage. Solo TV draws inherit saved account filters plus this
TV's device overrides, and the phone remains the place to change rating, genre
and runtime.

## The readout is the control

The first release showed neither scope nor streaming, on the reasoning that
rules which shape selection need no control on an idle screen. That was half
right: the rules do not need controls, but the room does need to know what they
are, and somebody watching alone reasonably wants tonight's answer to differ
from last night's without fetching a phone.

The revision separates the resting state from the tuning state rather than
adding a second column to the stage:

- The pool line becomes the single way in. It reads `2 of 6 titles across 2
  bowls` beside the services the draw is using, and selecting it opens a sheet.
  The resting stage therefore gains one sentence and one focus stop, not a panel
  competing with the draw target.
- What the line shows about streaming follows the mode. `Top` names the service
  the resolved pool actually landed on -- not the account's rank 1, which the
  draw abandons whenever nothing on it survives the filters -- with `first`
  beside it. `All` weights every service the same, so the line shows the set
  (three logos and a `+N`) rather than electing one to stand for the rest. Off
  shows none.
- The sheet owns the screen: your bowls as poster stacks with a slip count and
  a checkbox, then the existing streaming modes and service ranking. A
  television reads one list at a distance far better than controls flanking the
  thing it is competing with, which is what the rejected export tried.
- Bowl scope is session-only, as on the web. A television is shared, and a bowl
  excluded on Tuesday must not still be missing when somebody else draws on
  Friday.
- A streaming change writes this TV's device override, never the account, so
  relaxing a filter tonight does not rewrite what the owner browses with
  tomorrow.

Counts say what they can afford. Per bowl the sheet shows slips -- your own
undrawn rows in that bowl -- because that is what adding the bowl brings in and
it costs nothing to know. The stage line de-duplicates into distinct titles,
matching the draw, where a movie in three bowls still has one chance. It shows
the filtered count only once the lookups land: `2 of 6 titles` when they have,
`6 titles` while they have not, since a filtered number that guesses is worse
than one that waits.

Solo uses violet to distinguish a private draw from the rose group-bowl stage,
but keeps the TV type ramp, bowl illustration, ticket, dialogs, focus ring, and
movie detail treatment.

## Flow

1. The bowl picker offers one compact `Draw from my movies` route choice before
   the bowl cards. Returning from solo restores focus to it.
2. Select opens the quiet solo stage. Select on the draw target opens a short
   confirmation; the TV does not require a remote long-press.
3. The pool line opens the scope sheet, where bowls are checked and streaming
   priority is set. Back closes the sheet before it leaves the screen.
4. The draw is committed before reveal and held behind the TV's minimum draw
   animation. A failed save never reveals the title and retries with the same
   request id.
5. With theater mode off, the standard TV movie detail opens immediately.
6. With theater mode on, eligible previews are deduplicated by solo title
   identity, all copies of the feature are excluded, and the TV pre-roll runs.
   Its natural completion uses the existing safe provider-app handoff.
7. Back exits previews first, then the trailer or reveal, and finally returns to
   the bowl picker. A provider return restores the committed reveal instead of
   drawing again.

Loading, read failure, empty pool, filters excluding the pool, storage failure,
and retryable commit failure all remain actionable without adding permanent
controls to the stage.

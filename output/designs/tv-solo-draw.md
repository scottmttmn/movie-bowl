# TV Solo Draw

Status: implemented September 16, 2026.

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
- a quiet distinct-title and bowl count; and
- the theater ticket, because it changes what happens immediately after this
  draw and is therefore a decision for the room.

The screen deliberately does not offer bowl scope, filter editing, streaming
ranking, identity badges, or history browsing. Solo TV draws use all accessible
bowls and inherit saved account filters plus this TV's existing device
overrides. Those rules still shape selection; they do not need a control on the
idle screen. The phone/web remains the place to change them.

Solo uses violet to distinguish a private draw from the rose group-bowl stage,
but keeps the TV type ramp, bowl illustration, ticket, dialogs, focus ring, and
movie detail treatment.

## Flow

1. The bowl picker offers one compact `Draw from my movies` route choice before
   the bowl cards. Returning from solo restores focus to it.
2. Select opens the quiet solo stage. Select on the draw target opens a short
   confirmation; the TV does not require a remote long-press.
3. The draw is committed before reveal and held behind the TV's minimum draw
   animation. A failed save never reveals the title and retries with the same
   request id.
4. With theater mode off, the standard TV movie detail opens immediately.
5. With theater mode on, eligible previews are deduplicated by solo title
   identity, all copies of the feature are excluded, and the TV pre-roll runs.
   Its natural completion uses the existing safe provider-app handoff.
6. Back exits previews first, then the trailer or reveal, and finally returns to
   the bowl picker. A provider return restores the committed reveal instead of
   drawing again.

Loading, read failure, empty pool, filters excluding the pool, storage failure,
and retryable commit failure all remain actionable without adding permanent
controls to the stage.

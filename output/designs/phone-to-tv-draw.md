# Phone to TV Draw

Status: implemented October 2026. Needs Realtime on the Supabase project and
migration `20261008120000_add_bowl_live_channel.sql`; without either, every
screen draws exactly as before and nothing is shown.

## The idea

Someone holds to draw on their phone, and the television open on the same bowl
plays the reveal and lands on the movie, with the remote ready. The household
does not need everyone's phone out: one phone draws, the room watches the TV.
The same channel gives a bowl shared with someone far away a draw both ends see.

## What each screen does

- **The phone** shows a lit television beside "Hold to draw" while a TV is
  listening on the bowl, halfway between the end of the label and the button's
  edge. Its accessible name adds "It will play on the TV too." The phone still
  plays its own reveal.
- **The television** listens only while it sits idle on the bowl's draw screen:
  not mid-draw, not on a drawn movie, a dialog, a preview or a handed-off
  streaming app. That is also the only time it tells the phones it is there.
  An announced draw plays from the start: the slips rise and sort while the
  bowl is read again, and the reveal lands only on a draw that read shows. A
  paper slip in the top-left corner carries a phone and the drawer's name.
- **Another web tab** on the bowl plays the draw the same way when nothing else
  is open on it; otherwise it just refreshes.
- **Coming back** to a bowl page that was out of sight reads the bowl again. A
  phone asleep in the background misses the broadcast, so a draw made
  meanwhile shows in the watched list. It never replays: Scott chose the
  result alone.
- A draw made on the **television** is announced too, naming nobody: the TV is
  signed in as its owner, not whoever holds the remote.

## How

One private Supabase Realtime channel per bowl, `bowl-live:<bowl id>`
(`src/hooks/useBowlLiveDraw.js`, `src/utils/liveDraw.js`).

- Presence: the television tracks `{ surface: "tv" }` while idle.
- Broadcast `draw`: `{ v, bowlMovieId, title, methodId, preview, reveal,
  drawnBy }`, sent by the drawing screen after its draw is saved. `preview` is
  the pool its stage sorted; `reveal` is what `handleDraw` returned, so
  rotation's line-up still comes from the database.
- The channel is only a nudge. A listener reloads the bowl (`useBowl().reload`
  now returns the watched list it read) and plays nothing unless the bowl's
  newest draw event is for `bowlMovieId`, is under ten minutes old, and has not
  already played on that screen, so an announcement cannot replay history. It
  is also ignored, beyond the refresh, while anything is open over the bowl. A
  person-first or rotation reveal is kept only
  when its chosen person is the drawn slip's contributor (a pack slip is
  exempt), so a replay never lands on someone the draw did not pick.

`realtime.messages` policies, through `public.can_use_bowl_live_channel`:
members and the owner may join and use presence; only someone who may draw
(`can_draw_from_bowl`) may broadcast. Asserted in
`supabase/tests/20261008120000_add_bowl_live_channel.sql`; reverted by
`supabase/rollback/20261008120000_remove_bowl_live_channel.sql`.

## Not done

- No live list updates for adds or deletes; only draws travel.
- The phone does not stay quiet when a TV plays the draw. Scott chose both.

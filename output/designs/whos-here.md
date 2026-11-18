# Who's here

Status: web built November 18, 2026, with Watch History for present members
only. The television is next.

## The idea

Scott, November 17, 2026: the draw should come from the movies of whoever is in
the room. His first version made bowls temporary, assembled from the present
people's movies at each draw. That was set aside because a bowl carries more
than its slips -- the watched list, rotation history, invites, the television's
chosen bowl and its settings -- and drawing across bowls would need a friends
list the app does not have. One shared household bowl plus a "who's here" step
gets the same result.

## How it works

- On a bowl with more than one member, Draw is a tap. It opens the people sheet
  with every member checked; uncheck whoever is away, then Draw.
- An unchecked member's slips sit the draw out. Starter-pack slips, link guests
  and people who have left always stay in: only members have a seat to be
  missing from.
- The sheet is the draw's confirmation, which is why the button stops being a
  hold. "Don't ask again" brings the hold back, because without the sheet the
  hold is what keeps a toddler from drawing. The people count under the bowl
  opens the same sheet, with the box checked, to undo it.
- The stat line's people mark turns rose and reads 2/3 while someone is away,
  in the tone filters use. No odds anywhere.
- Absences are kept on the device, per account and bowl, for twelve hours.
  Nobody needs to remember to check last Friday's absentee back in.
- Only you checked: on a movie bowl the sheet's button becomes "Draw for
  myself" and opens solo draw on this bowl. Watching alone should go on your
  history only and spend nobody's turn.

## How it meets the draw

The absent members' slips are removed before anything else runs, so it composes
with every later stage rather than being one:

- Person-first: only the people here get a pile.
- Title-first: a flat raffle over the present people's slips.
- Rotation: `draw_bowl_movie_by_rotation` already chooses among the contributors
  in the pool it is given, so an absent member keeps their place in line.
- Filters and streaming priority run on the smaller pool; the amber "left out"
  ratio still applies among the people here.
- Live draw: the drawing screen broadcasts the reveal it played, so a TV open
  on the bowl replays only the present piles.

## Next

1. The television: pressing Draw opens a who's-here panel (faces in a row,
   D-pad to move, OK to check, focus starting on Draw) in place of today's
   confirmation screen. The confirmation comes back only where the panel
   does not appear: "Don't ask again" on that TV, or a one-person bowl.
   "Don't ask again" is kept on the TV itself, since whoever holds the remote
   is not the account it is signed in as.

## Watch History

A draw made with someone away stays out of that person's Watch History. The
draw functions still write a row for every member; right after the draw, the
drawer's phone calls `leave_away_members_out_of_draw` with the away members,
which deletes their rows for that one draw. Only the person who drew may, only
within ten minutes of the draw, never on a returned or removed draw, and never
their own row. The draw functions were left alone because they are the most
sensitive code in the repo; the cost is that a failed call leaves the away
members with an entry they can delete themselves, logged rather than shown.
The bowl's own watched list is unchanged: the draw happened in the bowl.

## Mockups

`/mnt/project-files/who-is-here/` in the project (v3 is what was built); the
faces row above the draw button was tried and dropped as clutter.

# TV catch-up

Status: built. Scott signed off on October 1, 2026, after two rounds of
mockups (`/mnt/project-files/ux-pass/tv-catchup/` in the project files).

The phone and desktop pass removed copy wherever a mark could say it. This
brings the television level with it.

## What changed

- **Choose a bowl.** The cards are My Bowls' cards at television size: the
  bowl, the name with the house on the home bowl, and the film strip and people
  counts. Owner, the date, "Open tonight's bowl" and the intro sentence are
  gone, and the solo row says only "Draw from my movies". The account sits on
  one line beside Sign out, which also stops it being cut off at 1080p. The
  home bowl comes from `get_my_bowl_context`; if that read fails the cards are
  simply unmarked.
- **The confirm stays.** One press of OK on a remote should not draw by
  accident, so it is still two buttons with Draw focused. It shows the bowl and
  asks "Draw a movie?" (solo: "Draw for myself?"), and its button says Draw, the
  word on the button that opened it. The solo confirm used to promise that
  nothing left a shared bowl, which was false with automatic removal on.
- **The drawn movie is tonight's sheet.** As on the phone: no kicker or pill,
  the note on the contributor's paper slip with their initial, one primary
  "Watch on …" button, and the other services and stores as logos. The TV has
  no browser to unfold the logos into, so they are a glance, not a control. A
  rental can be the primary button but never takes first focus.
- **The trailer keeps its word.** A bare play button beside Watch, or on the
  poster, read as playing the film itself (Scott's call), so it is a "▶ Trailer"
  button.
- **Solo draw** is laid out like a bowl's page: "Solo Draw" with your initial
  where a bowl shows its method, the draw button, and the pool as the film strip
  and a small bowl. The line still opens the sheet that changes them.
- **The watched strip** is headed "Watched", the web's word.
- **A watched movie** (pressing a poster in that strip) is the same sheet a
  night later, signed off on the same day after a third mockup
  (`/mnt/project-files/ux-pass/tv-watched/`). The slip is there, a green check
  says "Watched" and the date, and "▶ Trailer" is where the remote starts. For
  two hours after the draw "Move to Bowl", the phone's words, sits beside it;
  after that it is simply absent, with no paragraph explaining why. Its confirm
  has the draw confirm's shape and keeps one line, because the one consequence
  the screen cannot show is that the pick leaves everyone's Watch History. No
  streaming logos, since nobody is choosing how to watch it any more, and no
  Close: Back on the remote closes it, as it does the drawn movie.

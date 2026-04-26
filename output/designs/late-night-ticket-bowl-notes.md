# Late Night Ticket Bowl

This is a design-only exploration that combines the strongest parts of the existing prototype bundle without touching the production app yet.

## Reuse Review

- `variations/night.jsx`
  - Keep: the late-night atmosphere, reddish marquee lighting, strong uppercase hero typography, and event-like movie-night framing.
  - Drop: the poster-stack-in-bowl metaphor and poster-first draw reveal.

- `variations/night-states.jsx`
  - Keep: the state-thinking for empty, single-title, and guided next actions.
  - Rework: state copy so it talks about tickets in the bowl rather than reels or posters.

- `variations/bowl-contents.jsx`
  - Keep: the idea that the bowl should visibly contain a physical object.
  - Reuse specifically: the `BowlTickets` direction, not the other bowl-content options.

- `variations/marquee.jsx`
  - Keep: ticket geometry, perforation details, admit-one styling, and ticket-stub archive language.
  - Avoid copying wholesale: the brighter cream-forward palette is less aligned with the preferred late-night mood.

- `variations/paper.jsx`
  - Keep: the physicality of "the bowl truly contains something" and the idea that the selected object should transform into the reveal.
  - Drop: the warm editorial-paper look and rolled-poster object model.

## Recommended Combined Direction

- Before draw:
  - Dark late-night shell.
  - Bowl contains layered anonymous paper tickets with side notches and subtle print texture.
  - Bowl shape should stay close to the original handoff ceramic bowl.
  - Count badge still sits near the bowl for immediate inventory.

- During draw:
  - One ticket rises from the bowl into a spotlight.
  - Ticket remains anonymous during lift so suspense survives the animation.

- After draw:
  - The ticket is "printed" with movie metadata.
  - Use a realistic theater-ticket layout instead of a generic modal card.
  - Include title, year, runtime, rating, service, added-by, draw number, auditorium/seat style fields, and optional showtime/date.
  - Allow decade-aware ticket treatments based on release year.

## New Prototype

- File: [late-night-ticket-bowl-prototype.html](/Users/scottmittman/Code/movie-bowl/output/designs/late-night-ticket-bowl-prototype.html)
- Purpose: visual alignment artifact before implementation

## Why This Direction Works

- It preserves the strongest emotional quality from the late-night exploration.
- It makes the bowl metaphor more literal and memorable.
- It keeps the draw suspenseful by hiding movie identity until selection.
- It gives the chosen movie a richer end state than a plain card or poster modal.

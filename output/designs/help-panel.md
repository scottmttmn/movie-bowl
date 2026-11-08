# Help panel

Status: built (November 2026).

A quiet way to ask how to do something. A bare ? sits in the header to the
left of +, dimmer than it and without a box, signed-in only and web only (the
TV has no keyboard). It drops a small panel from the header: one field, "How
do I…". The answer is one line and one link to the place that does it, where
the element is ringed once on arrival (`HelpLanding`). A question with no
answer -- a bug, an idea, something the app does not do -- gets "No answer for
that." and a one-tap **Send as feedback**, which is how the guide learns what
it is missing.

Nothing pops up, glows or greets. There is no chat history and no follow-up.

## Why the model cannot invent features

Every answer is written by hand in `src/utils/helpTopics.js`: an id, what it
answers (`ask`, the model's only view of it), the one-line answer, the route,
an optional element to ring, and the link's label. The `help` action of
`api/tmdb/search` (no new Vercel function) sends the question and the ids with
their `ask` lines to the same Groq-then-Cloudflare models as smart search, and
keeps only a listed id or null. So the worst case is a pointer to the wrong
real feature, never a description of one the app lacks.

## Keeping the guide true

- `src/utils/__tests__/helpTopics.test.js` fails when a topic's route is not a
  route in `App.jsx` or its ringed element id is not drawn by that screen.
- `npm run eval:help` scores the model's choices on `scripts/help-eval/cases.json`,
  including questions that must get no topic. Run it after changing the guide
  or the model.
- CLAUDE.md asks any change to something a person would ask how to do to
  update the guide in the same change.

## Rejected placements

The add-a-movie search box (Scott, 2026-11-08: search should not be
overloaded), a Help item in the menu and a merged "Help & feedback" item (the
menu is long enough), a boxed ? like the other header buttons (it should be
less prominent than +), and the ? to the right of the menu (it breaks the
header's right edge).

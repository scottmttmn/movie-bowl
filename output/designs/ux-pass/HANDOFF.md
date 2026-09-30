# UX pass handoff

Status: in progress. Items 01–13 are merged, and item 14 (first run) is
prototyped and signed off but not built. This note is for whoever picks the pass
up next.

## How Scott wants this built

- **Mockup first, every item.** Show him the proposal before building. It has to
  be the real app captured at phone size, not a stylised stand-in. Build only
  after he signs off.
- **Show, don't tell.** Prefer a visual signifier to explanatory copy. Remove
  words wherever a shape, mark or motion can do the job.
- **No "put back in the bowl" on the drawn movie's sheet, ever**, and no setting
  for it either. Friction against re-rolling is the point. The undo stays in the
  Watched strip.
- **No odds panel, ever.**
- **Merging.** Once Scott has signed off the mockup, and the review is addressed
  and CI is green on the PR, merge it and move on to the next item without
  asking.
- One item per PR. Follow CLAUDE.md for the gate, the test-count line, commit
  style, and the rule on session links.

## What is done

| Item | What | PR |
| --- | --- | --- |
| 01, 02 | The bowl answers the hold; the pick lands as tonight's sheet (a slip with the note and one Watch/Rent button, other options folded behind logos) | #238 |
| 03 | Search marks titles already in this bowl, watched, or in another of your bowls (`src/utils/searchMarks.js`) | #239 |
| 04, 06–12 | Signifier sweep: Favorite ribbon, home pill, bowl cards, solo draw in the menu, ticket contrast, whole-card taps, empty Watched, one icon set | #241 |
| 05 + rename | The header + adds to the bowl on screen; the pin is called "Favorite" in all copy | #242 |
| 13 | Filter and settings rows read as rows (`FilterRow`, `StreamingPreferenceRows`, `filterSummaries.js`); settings tiles use an arrow, because a chevron reads as "expand" | #244 |
| — | The bowl picker shows counts with My Bowls' film-strip and people marks | #245 |

## Item 14, the first run: signed off, not built

Mockup: [`first-run/mockup.html`](first-run/mockup.html). Open it locally; the
images sit beside it.

The prototype is on branch `claude/project-thread-qhn3w7`, in two commits on top
of `main`:

1. **One-field first run** (`src/screens/MyBowlsScreen.jsx`). A signed-in
   account with no bowls, no pending invitations and no load error sees one
   card: the bowl illustration, a "Name your bowl" field, and a "Create bowl"
   button.
   - Submitting creates the bowl through `useCreateBowl().create()` and
     navigates straight to `/bowl/:id`. The empty bowl already offers starter
     packs to its owner.
   - The old guided setup is gone: the "First steps" hero, the two step cards,
     the streaming-services step, and the page subtitle.
   - `NewBowlButton` is hidden while the first-run card shows.
   - The create modal, with its invite field, is still used once you have any
     bowl.
2. **Add a service from the drawn movie** (`src/components/AddMovieModal.jsx`,
   `src/screens/BowlDashboard.jsx`). This is how people now discover streaming
   services, since the first run no longer asks for them.
   - `AddMovieModal` takes an `onAddService(name)` prop. `BowlDashboard` passes
     it only to the tonight sheet, where it saves through
     `useUserStreamingServices().saveStreamingServices`.
   - With no services chosen, the tonight logo row ends in a + instead of `+N`.
   - "Streaming on …" in Where to watch starts open. `isOtherStreamingOpen` is
     `null` until toggled, and it defaults to open in that case.
   - Each subscription service you don't have renders as a dashed pill button
     with a +, labelled "Add Max to your services".
   - Tapping one saves it, and the pill becomes the green ticked "your service"
     pill. Once you have any service, the other services fold as before, but
     each still carries its + when opened.
   - Known and accepted: after adding, the rent button can disappear with
     nothing replacing it. That happens because "Open the service's website for
     a drawn movie" is off by default, and every account with that setting off
     already sees the same today. Leave it.

### To finish item 14

- **Unit tests.** `src/screens/__tests__/MyBowlsScreen.test.jsx` has 11
  failures against the prototype, all from the removed guided setup ("Create
  your first bowl", "Set up streaming services", "Start your first movie
  bowl").
  - Rewrite them for the one-field card: create-and-navigate, the error shown
    in place, and the card gone once a bowl or pending invite exists.
  - The invite-related cases need a bowl or an invite in state so that they
    reach the normal list and modal.
- **New tests for the service +.**
  - In `AddMovieModal`: the + pill appears only with `onAddService` and only
    for unmatched subscription services; it calls back with the normalized
    name; "Streaming on" starts open when there are no services; the tonight
    row shows + instead of a count.
  - In a `BowlDashboard` draw-flow test: tapping + saves the profile's
    `streaming_services`.
- **E2E.** `e2e/memberJourney.e2e.js:11-17` still creates the bowl through
  "Create your first bowl", the modal and the bowl card. Change it to fill
  "Name your bowl", press "Create bowl", and expect the `/bowl/:id` URL
  directly.
- **Check one open detail.** With no bowls, the header + still shows. Decide
  whether it should open the first-run field or simply stay as it is. It was not
  looked at.
- **The rest of the gate.** Run it as CLAUDE.md says, refresh the count
  sentence, and update `ONBOARDING.md` or `README.md` if either describes the
  old guided setup.

## What is left after item 14

- **Delight ideas from the review.** Each one needs its own mockup first, and
  none is agreed yet:
  - a bowl illustration that fills with the count;
  - your slips tinted in your colour;
  - a "How was it?" prompt the next day, feeding the private comment;
  - "Casey added 2 since Friday", shown once;
  - an upturned empty bowl offering a starter pack or an invite.
- **The TV pass.** Scott queued it to follow this one, and it starts from a
  mockup.
  - First, refine the full-screen draw reveal (`DrawRevealStage`). Remove the
    copy near the top of the screen on every device: it clutters the scene and
    breaks show-don't-tell, and it is worst on the TV.
  - Review item 15 belongs here as well: the TV method mark
    (`TvDrawMethodMark`) reads as a profile button. Draw it as an unframed slip.

## Capturing mockups locally

Captures come from the real app using the Playwright fake backend.

- Run Vite on `127.0.0.1:4173`, because the fake backend accepts no other
  origin:
  `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=movie-bowl-e2e-anon-key npx vite --host 127.0.0.1 --port 4173 --strictPort`.
- Use a small Node script that imports `e2e/support/captureSetup.js` for a
  seeded account (bowl `evolution-bowl`). For an empty account, use a temporary
  spec with `backend.authenticate(page)`.
- Stop the server by port (`fuser -k 4173/tcp`), not with `pkill -f`, which can
  match the shell running it.
- Delete the temporary scripts before committing.

# UX pass handoff

Status: item 14 is implemented on `codex/finish-first-run`, following the
signed-off prototype. Items 01–13 are merged. The remaining work begins with
the TV mockup described below.

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

## Item 14, the first run: implemented from the approved mockup

Mockup: [`first-run/mockup.html`](first-run/mockup.html). Open it locally; the
images sit beside it.

The original prototype is preserved on `claude/project-thread-qhn3w7`. The
completion branch includes the latest `origin/main` and these two changes:

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

### Item 14 completion

- Local gate passed: lint with zero warnings, production build, 182 Vitest
  files / 1746 tests, and 112 Playwright tests (100 passed, 12 skipped). Both
  count checks pass. Browser captures confirm the phone form and service pills.
- First-run tests now cover naming, creation and direct navigation, one inline
  error, and the normal directory when a bowl or pending invitation exists.
- The first-run screen no longer reads streaming preferences or waits for them.
- The header + focuses "Name your bowl" while the first-run card is showing,
  as Scott confirmed on September 30, 2026.
- Service + tests cover normalization, unmatched subscriptions, passive free
  providers and stores, persistence, folding after saving, and retry after an
  error. Saving disables the service choices until the request finishes.
- The member journey uses the inline first-run form. A second journey verifies
  that adding Max from a draw writes `profiles.streaming_services`, then checks
  that it is still selected in Settings after a reload, on desktop and phone.
- README now describes the first-run and service discovery paths. ONBOARDING
  describes contributor setup and does not contain the removed guided setup.

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
- On the Mac, stop the server through its terminal session. If that session
  is unavailable, identify the listener with `lsof -nP -iTCP:4173 -sTCP:LISTEN`
  and stop that specific PID. `fuser -k` is a Linux command.
- Delete the temporary scripts before committing.

### Local verification on Scott's Mac

Node 24 and the dependencies are already installed. Local checks exclude the
separate checkout under `.claude/worktrees` so its tests do not run twice:

```sh
npm run lint -- --ignore-pattern '.claude/**'
npm run test:run -- --exclude '**/.claude/**'
npm run build
npm run test:e2e
npm run test:counts
```

Playwright starts and stops its own Vite server. Let it finish before starting
another server on port 4173.

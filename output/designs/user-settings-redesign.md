# User Settings redesign

Status: implemented (`src/screens/UserSettings.jsx`).

The page had grown by accretion: one panel held everything, and the grouping
followed the storage shape (`streaming_services`, then `default_draw_settings`)
rather than what a person came to change. This records what moved and why, so a
later feature lands in the right section instead of at the bottom.

## What was wrong

- **Grouping followed the database.** "Prioritize my streaming services", "Use
  my service ranking", and "Open preferred streaming website" sat under
  *Default Draw Settings*, scrolled away from the service list they act on,
  because all three live in the `default_draw_settings` JSON. TV theater mode
  sat there too, and it is not a draw setting at all.
- **The picker dominated.** A 30-row checkbox grid opened first and pushed
  everything else below the fold.
- **Manage and Rank were separate tabs.** You could not see the ranking you
  were building while picking, and an empty list dead-ended in "Select services
  in Manage services before ranking."
- **No state readout.** Nothing said what your settings currently were without
  opening three disclosures.
- **Five hand-rolled toggle switches** had drifted on spacing, and none of them
  had a focus style.

## The shape now

A hero, two sections that each answer one question, and a playback reset footer.
Draw filters now live only in the dashboard overlay and autosave; see
`retire-draw-filter-defaults.md`.

| Section | Question it answers |
| --- | --- |
| Streaming services | What can I play, in what order, and should a drawn movie offer a web launch? |
| TV & playback | What happens on the TV once a movie is drawn? |

- **Hero summary tiles** read back each section's current state ("3 services •
  Netflix first", "Theater mode on • 2 previews") and double as the jump nav — they are anchors to the two
  section ids, so the page needs no separate nav and no scroll-spy JS. They
  live in `components/SettingsSectionNav.jsx`, shared with Bowl Settings (see
  `bowl-settings-redesign.md`).
- **Streaming services is one flow.** "Your ranking" (numbered rows, drag,
  arrows, remove) sits above "Pick your services" (search, quick actions, chip
  grid), so picking a service visibly lands in the ranking. The tabs are gone.
  The two drop rails per row are gone too: a row's own `dragover` already knew
  whether the pointer was in its top or bottom half, so the insertion point is
  now a single rose line rendered from that.
- **Checkbox rows became chips** — same `<input type="checkbox">` underneath,
  visually hidden, so the semantics and the label association survive.
- **Playback handoff stays with services.** The preferred website toggle is
  disabled with an explanation until a service is picked. Prioritizing services
  and following their ranking during a draw are edited in the bowl's Filters
  overlay alongside ratings, genres, and runtime.
- **`SettingToggle`** remains local to the screen. The removed filter editor's
  disclosure helper and state are gone.

## Deliberately unchanged

- The profile storage shape and autosave contract. Playback saves send only
  playback keys and the shared hook merges them with the loaded filter values.
- The `#streaming-services` hash link from the bowl dashboard and My Bowls
  still scrolls to the same section — it just no longer has a tab to select.
- No account section. Email and Log out already live in the top nav menu, and
  duplicating them here would mean a second source of truth for sign-out.

## Reset scope

“Reset playback” restores preferred web launch, theater mode, and trailer count.
It keeps the service list, ranking, and remembered filters. Both the footer copy
and confirmation say what is reset and what is kept.

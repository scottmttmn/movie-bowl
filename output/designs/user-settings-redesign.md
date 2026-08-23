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

A hero, three sections that each answer one question, and a reset footer.

| Section | Question it answers |
| --- | --- |
| Streaming services | What can I play, in what order, and how do draws use that? |
| Draw filter defaults | What does every bowl's filter panel start from? |
| TV & playback | What happens on the TV once a movie is drawn? |

- **Hero summary tiles** read back each section's current state ("3 services •
  Ranked priority", "PG, PG-13, R • 4 genres • 80-165 min", "Theater mode on •
  2 previews") and double as the jump nav — they are anchors to the three
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
- **The three streaming behavior toggles moved next to the services**, under a
  "How draws use them" heading. With no services picked they are disabled and
  say why ("Pick at least one service to turn this on") instead of silently
  refusing.
- **Draw filter defaults is only the filters** — ratings, genres, length —
  each a disclosure whose collapsed row already shows its value.
- **`SettingToggle` and `SettingDisclosure`** are local components in the
  screen. They stay local until a second screen needs them.

## Deliberately unchanged

- Every setting, its storage shape, and the autosave contract. This is a
  layout and grouping change; `useUserStreamingServices` and
  `normalizeDefaultDrawSettings` were not touched.
- The `#streaming-services` hash link from the bowl dashboard and My Bowls
  still scrolls to the same section — it just no longer has a tab to select.
- No account section. Email and Log out already live in the top nav menu, and
  duplicating them here would mean a second source of truth for sign-out.

## Reset scope

"Reset to defaults" restores everything in `default_draw_settings` — which now
spans two sections plus the streaming toggles — but never the service list.
That is why it sits in a footer below all three panels rather than inside one
of them, and why both the footer copy and the confirm dialog name what it
covers and what it keeps.

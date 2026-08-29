# Retire draw filter defaults

Status: **plan, not implemented.**

Removes the *Draw filter defaults* section from `/settings` by making the bowl
dashboard's filter panel remember what you last drew with. No schema change and
no data migration: the same profile column keeps the same shape, it just gains a
different editor.

## What is wrong

There are two editors for one set of values.

`UserSettings.jsx` writes ratings, genres, and runtime into
`profiles.default_draw_settings`. `BowlDashboard.jsx:335-349` reads them exactly
once per mount, behind `didApplyDefaultDrawSettings`, to seed a filter panel that
then forgets everything the moment you leave. The settings section's entire job
is prefilling a control that already sits next to the draw button.

That split creates the worst bug in the current design, and it is not the
duplication — it is action at a distance. Set "R only, 90–165 min" on the
settings screen, draw in the family bowl three weeks later, get "no movies
match," and the explanation lives on a screen you are not on.

**The panel forgetting is the actual defect.** Fix that and the settings section
has no remaining job.

## The change

The dashboard filter panel becomes the only editor for draw filters. It
hydrates from `default_draw_settings` on load exactly as it does today, and
autosaves back to it as you change filters. `/settings` loses its *Draw filter
defaults* section.

Same column, same normalizer, same TV read path. Today's saved defaults become
tomorrow's remembered filters with no migration step.

## Why persisting from the panel is safe

Persisting filter state is only dangerous when the state is invisible — which is
precisely what the settings screen made it. The dashboard already carries the
affordances that fix this:

- `isFilterEngaged` (`BowlDashboard.jsx:282`) puts a rose dot on the filter icon
  whenever a selection *could* narrow the draw, marking set state rather than
  effect, so it cannot flicker as the bowl changes.
- Each filter's collapsed row already reads back its own value
  (`ratingSummary`, `genreSummary`, `runtimeSummary`).
- `resetDrawFilters` (`:303`) is one tap away inside the panel.

State that persists is legible at the point it acts. That is the thing the
separate screen could never offer, and it is why this is a net reduction in
surprise rather than a shorter fuse on the same bug.

## Who owns `default_draw_settings` afterwards

| Key | Editor after this change |
| --- | --- |
| `prioritizeStreaming` | Dashboard panel (already there) |
| `useStreamingRank` | Dashboard panel (already there) |
| `selectedRatings`, `includeUnknownRatings` | Dashboard panel |
| `selectedGenres`, `includeUnknownGenres` | Dashboard panel |
| `runtimeMinMinutes`, `runtimeMaxMinutes`, `includeUnknownRuntime` | Dashboard panel |
| `enablePreferredWebLaunch` | `/settings` → Streaming services (unchanged) |
| `theaterModeEnabled`, `theaterTrailerCount` | `/settings` → TV & playback (unchanged) |

**The dashboard must merge, not replace.** Two screens now write one JSON
column, and `saveDefaultDrawSettings` currently normalizes and writes the whole
object. If the dashboard writes only the keys it owns, it silently resets
theater mode and preferred web launch every time someone changes a filter. This
is the one real correctness risk in the change, and it gets its own test.

## Implementation

1. **`useUserStreamingServices.saveDefaultDrawSettings`** merges over the last
   loaded value instead of replacing it, so a partial write cannot clobber keys
   the caller does not own.
2. **`BowlDashboard`** wraps its filter state in `useAutosave`, saving through
   that merge. Ordering matters: `enabled` must stay `false` until
   `didApplyDefaultDrawSettings` flips, or the arriving profile read is written
   straight back as an edit. The hook documents this contract, and
   `UserSettings.test.jsx:98` already pins the equivalent behavior on the
   settings screen.
3. **`resetDrawFilters`** keeps meaning "back to what shipped" and now persists
   that. It stays one concept rather than growing a session/saved distinction.
4. **Delete from `UserSettings.jsx`**: the `#draw-defaults` section
   (`616-863`), the local `SettingDisclosure` helper (`73-100`, used only there),
   `filtersTileSummary` and the three summary memos feeding it, the middle
   `SettingsSectionNav` tile, and the now-unused `DRAW_GENRE_OPTIONS`,
   `MPAA_RATING_OPTIONS`, and runtime-bound imports.
5. **Reset footer copy** narrows — it no longer spans three sections, and
   `handleResetDefaults` should name what it actually still covers.

## What the TV sees

Unchanged. `buildDrawOptions` (`TvTonightScreen.jsx:110`) and
`getPreferenceLines` (`:211`) keep reading `default_draw_settings` and need no
edit.

The TV's behavior does get quietly better: it now reflects the filters you last
*drew with* on your phone rather than the ones you last *typed* on a settings
screen. This is also why the remembered state stays a profile column instead of
`localStorage` — the TV is a different device, and the house storage helper
(`utils/lastOpenedBowl.js`) is explicitly per-device.

## Still per-user, deliberately

One filter set continues to follow you into every bowl. A kids bowl and a
late-night bowl still share it — this change does not fix that and does not make
it worse.

Per-bowl filters are the better answer and a much bigger change: a new store,
plus a decision about which bowl's filters the TV reads before a bowl is picked.
Out of scope here. It is worth noting that TODO.md already carries the same
constraint from the other direction — a bowl-wide committed queue is blocked on
filters being per-user today.

## Relationship to the dashboard hero redesign

`bowl-dashboard-hero.md` slice 2 moves this panel out of its inline position
into an overlay anchored under the header. That is a layout change; this is an
ownership change. They touch the same component but not the same lines, and
either can land first.

## Tests

- A filter edit on the dashboard autosaves to the profile.
- A filter write preserves `theaterModeEnabled`, `theaterTrailerCount`, and
  `enablePreferredWebLaunch` — the merge guarantee above.
- Hydration does not write back on load.
- Reset persists.
- Remove `UserSettings.test.jsx:265` ("updates default draw settings controls")
  and the draw-defaults half of `:215` ("summarizes each section").
- Refresh the test-count tripwire in `CLAUDE.md` in the same commit.

## Rollback

The column and its shape are untouched, so reverting the commit restores the
settings section and every stored value still reads correctly. No entry in
`supabase/rollback/` is needed.

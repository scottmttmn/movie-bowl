# Remembered draw filters

Status: **implemented.**

The bowl dashboard's Filters overlay is the only editor for draw filters. It
loads the saved values and autosaves changes to `profiles.default_draw_settings`.
Settings keeps service selection and ranking, preferred web launch, and TV
playback. There is no separate Draw filter defaults section.

## Experience

- The filter icon opens “Narrow the draw” under the header. Rating, genre,
  runtime, and streaming-priority controls share a live eligible count.
- The overlay scrolls internally while its header and Done button stay visible.
  Escape, Done, or the backdrop closes it without adding browser history;
  keyboard focus stays inside and returns to the opening control afterward.
- The rose dot marks active filtering. Saved genres remain visible in the
  editor even when the current bowl has no matching titles.
- Edits apply immediately and save after a short pause. Save status appears by
  Done; a failure leaves the filters usable for this draw and offers Retry,
  including after the overlay closes.
- Reset restores the shipped filter values and saves them. It does not reset
  preferred web launch, theater mode, or trailer count.
- One filter set follows each user across bowls and is read by the TV on load.
  These are not per-bowl or shared group settings, and already-open TV screens
  do not receive live updates.

## Ownership and persistence

| Keys in `default_draw_settings` | Editor |
| --- | --- |
| `prioritizeStreaming`, `useStreamingRank` | Dashboard Filters |
| Rating, genre, and runtime selections, including unknown-value toggles | Dashboard Filters |
| `enablePreferredWebLaunch` | Settings → Streaming services |
| `theaterModeEnabled`, `theaterTrailerCount` | Settings → TV & playback |

The existing column and normalization shape are unchanged. Each editor sends
only its own keys. `saveDefaultDrawSettings` merges these into its loaded
settings before saving, so a filter edit does not reset playback and a playback
edit does not reset filters. A completed save does not replace a newer local
edit made while the request was in flight.

`useAutosave` stays disabled until profile hydration has finished. Loading a
profile is not an edit. A failed load prevents edits until Retry succeeds;
writing defaults over unread preferences is unsafe. Pending edits flush when
leaving the screen, and the existing unload warning protects unsaved requests.

Settings' **Reset playback** resets only web launch, theater mode, and trailer
count. It preserves the service list, ranking, streaming priority, and all
remembered draw filters.

## Scope and limitations

No migration, new table, or API endpoint. The TV keeps reading the same profile
column. Per-bowl filters and conflict resolution for simultaneous edits on
multiple devices remain separate work; the merge uses the current editor's
loaded profile, not an atomic server-side JSON patch.

## Validation

- Hook tests cover partial merges in both directions, a slow save with a newer
  edit, and refusing to overwrite preferences after a failed load.
- Dashboard tests cover hydration without writes, zero runtime, saved genres
  missing from this bowl, persistence after remount, Reset, failed-save retry,
  navigation during debounce, keyboard focus, and failed-load recovery.
- Settings tests cover its two-section navigation, playback-only writes, and
  playback reset without changing filters or services.
- Browser smoke checks reload persistence, the live count, Settings edits,
  Reset, and keyboard dismissal on desktop and mobile.

## Rollback

Reverting the client commit restores the previous editors. The existing column
and its shape are unchanged, so no database rollback is needed.

# Bowl Dashboard hero redesign

Status: slice 1 (hero) implemented; slice 2 (filters overlay) planned.

Distilled from a Claude Design mobile exploration ("Bowl Dashboard Mobile")
plus the decisions made when reconciling it with the shipped dashboard. The
design's goal is radical simplification of the hero: one dominant action, one
quiet line of state, no standing explanatory copy.

## Decisions

### Hold to draw (implemented)

- The draw trigger is a press-and-hold button (`HoldToDrawButton`,
  ~1s, visible progress fill). Completing the hold draws immediately — the
  hold itself is the intent gate, so the confirm dialog is skipped.
- Releasing or leaving early cancels. Secondary mouse buttons never start a
  hold. Long-press context menus and text selection are suppressed.
- Keyboard and assistive-tech activation (click with `detail === 0`) falls
  back to the existing "Reveal a movie?" confirm dialog — same intent gate,
  different physics. The dialog exists only for that path now.
- The design prototype's hold/immediate toggle was a prototyping knob, not a
  per-bowl setting. Hold is the behavior everywhere.
- Draw is the visually primary button; "+ Add Movie" is secondary below it.

### The stat line (implemented)

The three chips (`RemainingCount`, `DrawPoolCount`, `StreamingMatchCount`)
became one quiet sentence under the bowl (`BowlStatLine`). The design's static
"18 in the bowl · 7 streamable" hid real states, so the line keeps them:

- Unfiltered: "18 in the bowl". Filters narrowing: "12 of 18 eligible".
- Streaming (omitted when no services are saved): "7 on your services",
  "Favoring 4 on Netflix" when prioritized, "No service matches — using
  eligible pool" as a warning. When priority is enabled, the eligible count is
  the actual pool after rating, genre, runtime, provider matching, and service
  rank have all run. Over the auto-scan limit it is a tap-to-count affordance
  rather than an automatic N-request scan.
- Segments keep the chip tone vocabulary (idle/active/warning as `data-tone`)
  and tapping a segment opens the draw filters.

### Draw-method affordance (implemented)

"How this bowl picks" as standing disclosure copy is gone. In its place a ⓘ
glyph at the end of the stat line opens `DrawMethodInfoModal`, which renders
the method's registry copy (`utils/drawMethods.js` stays the single source of
truth). The contributor-reach warning kept a persistent surface: when any draw
setting shuts someone out of a person-first bowl, the pool segment and the ⓘ
turn amber, and the modal names who is excluded.

### Filters overlay (slice 2, planned)

- Filter icon and settings gear sit top right next to the bowl name; the
  filter icon carries a rose dot when any filter or streaming priority is
  active.
- The filter UI must not require scrolling: it opens as an overlay anchored
  under the header (not a bottom sheet — the prototype's sheet put Runtime/
  Done below the fold on phone heights). Content: Rating / Genre / Runtime
  rows, streaming priority toggle, live "N of M eligible" count, Reset, Done.
  If the expanded pickers overflow the viewport, the panel scrolls
  internally; the page never does.
- The inline filter panel and its toggle under the hero are removed when this
  lands.

## Explicitly deferred

- Reveal simplification (title, meta, provider buttons, quiet "Done";
  put-back only via the Watched strip) — close to current behavior; revisit
  separately.
- Once-per-day draw lockout after a put-back — new product behavior, needs
  its own design doc (see TODO.md).

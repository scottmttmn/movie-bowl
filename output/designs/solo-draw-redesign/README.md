# Solo Draw design export

Imported on 2026-09-16 from `Solo Draw Page Redesign.zip`. The exported files
are preserved unchanged, including the runtime, assets, reference images, and
original `github.md` provenance.

## Review status

- **Web / phone — ready as a visual direction.** The user described this design
  as "basically good to go."
- **TV — exploratory, needs revision.** TV solo draw does not exist yet. The
  user is not satisfied with this design; retaining it is not approval to ship it.

The web design is now implemented in `src/screens/SoloDrawPage.jsx`, on top of
its existing solo draw flow. TV remains a reference only. The exported
`github.md` is source-project context, not repository instructions.

The implementation uses real counts, filters, scope, posters, and committed
results. Rating, genre, and runtime changes autosave to account preferences;
streaming priority uses the existing device overrides. The settings gear opens
personal settings because a cross-bowl solo draw has no single bowl to configure.
The theater ticket now uses the same device-local setting, pre-roll overlay,
provider launch policy, and movie detail card as a bowl draw. Its preview pool
keeps solo's distinct-title and pin rules. Keyboard confirmation, modal focus
management, loading/errors, save retry, and large-pool checks remain available.

## Files and preview

- [Web / phone prototype](Solo%20Draw.dc.html)
- [TV exploration](Solo%20Draw%20TV.dc.html)
- [Original export notes](github.md)
- `uploads/`: the two reference images supplied with the export.

Open either HTML file in a browser, keeping the directory structure intact.
`support.js` renders the custom design markup and loads React from a CDN;
the designs also request Google Fonts, so a fully rendered preview needs network
access. These are standalone prototypes with sample data, not authenticated app
pages. They are not imported into the application bundle.

## Web design to carry into implementation

- Violet solo accent on the existing dark dashboard vocabulary, a centered
  bowl illustration, and a single initial/avatar with a "Just you" badge.
- Scope summary beside the page title; compact filter and settings affordances.
- One dominant hold-to-draw action, a quiet eligible/total readout, and a
  "How solo draw picks" information action.
- Separate "Drawing from" multi-select bowl chips with counts and an All bowls
  shortcut; an "In your pool" poster strip with source-bowl labels.
- A focused committed-result presentation with watch-history and Done actions.
  The theater-mode ticket is part of the visual proposal; its real behavior
  must be wired to the app's reveal flow.

## Reconcile prototype behavior before shipping

The [solo draw product contract](../solo-draw.md) governs real behavior. The
export is a visual reference, not a replacement for that contract:

- Replace sample movies, fabricated eligibility counts, random selection, and
  simulated saving with real pool resolution and successful persistence before
  reveal. Count distinct eligible titles consistently with selection; bowl chips
  count slips. The All bowls count must not shrink with the selected subset.
- Explain eligible pin priority and duplicate-title handling in the info copy.
  The prototype's blanket equal-chance statement omits pin priority.
- Wire filters to the existing device draw settings. The prototype filter action
  currently opens the information dialog. Resolve the settings affordance for
  cross-bowl scope rather than assuming one bowl's settings apply to all bowls.
- Reuse the production hold button's keyboard/assistive-technology confirmation
  path, focus management, and reduced-motion behavior. Prototype pointer-only
  interactions and sample dialogs are not the accessibility implementation.
- Preserve loading, retry, empty-scope, empty-pool, filtered-out, and large-pool
  manual-check states from the product contract.
- Keep reveal free of acceptance, redraw, undo, or removal controls. Draws leave
  bowl copies and pins intact; history owns the optional removal action.

TV requires a separate design review and implementation plan before adoption.

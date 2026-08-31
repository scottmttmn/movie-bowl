# Default Bowl and Global Add

Status: implemented locally on August 31, 2026; not deployed.
Product rules come from the August 30 discussion. See the implementation
record for verification results and remaining release checks. Dimensions and
interaction details below describe the agreed first version.

See the [implementation plan](default-bowl-and-global-add-implementation.md)
for database contracts, migration and replacement timing, shared client state,
add-operation safety, staged changes, verification, and rollback. This document
remains the source of truth for presentation and interaction.

## Purpose

Make adding a movie available wherever the signed-in user is in the phone/web
app. A user with one bowl opens Add and starts typing. A user with several sees
the destination immediately and can change it without leaving the form.

This spec covers navigation, the add dialog, the destination selector, the
default star on My Bowls, and their failure states. It retains movie search,
custom titles, optional comments, and existing add protections. It does not
change draw behavior, movie pins, public add links, or the TV experience.

## Entry points and meaning

| Entry point | Label | Initial destination | After success |
| --- | --- | --- | --- |
| Top navigation, on every signed-in route with that navigation | Plus and filmstrip icons; accessible name Add a movie | Saved default bowl, regardless of the current route | Keep dialog open for another movie |
| Bowl dashboard, including its empty state | Add to this bowl | Bowl being viewed | Keep the same dialog open for another movie |
| Watch History | Log a watched movie | Personal watch history; no bowl selector | Keep the existing manual-history workflow |

The first two open the same bowl-add flow. A temporary destination change
lasts for that open dialog, including subsequent successful additions, and
never changes the account default. Closing resets that temporary choice. The
next global Add starts at the saved default; the next contextual Add starts at
the viewed bowl.

Global Add remains a bowl addition even on Watch History. Do not put an
Add/Watched mode switch or a date field in the bowl-add dialog. Keep manual
history's date, comment, and optional removal of the user's own undrawn slips
in its existing separate workflow.

## Top navigation

```text
[existing bowl artwork] Movie Bowl      [ + filmstrip ] [ menu ]
```

- Place a plus and a short filmstrip icon together in one button immediately
  left of the existing menu button, with an 8px gap. This replaces the visible
  `+ Add` label; `filmstrip` in the sketch denotes an icon, not printed text.
  It is a separate button, not a menu item or a floating button.
- Keep the 64px header height and current page-container alignment. Use the
  existing secondary-button surface, a 16px plus and 20px filmstrip with a 6px
  gap, and a roughly 64px-wide, 44px-tall hit area. Both glyphs share one color
  and stroke weight; they are not separate controls. The draw remains the
  dominant rose action on the bowl dashboard.
- Use the same icon treatment on phone and desktop. Reduce the wordmark to
  18px below 360px if needed; do not shrink targets or drop the button into the
  menu. Nothing wraps onto a second header row.
- Accessible name and hover/focus tooltip: `Add a movie`. Mark the two icons
  decorative. Opening the button closes the navigation menu. Prefer the
  filmstrip over a camera, which could suggest recording or uploading a video.
- Retain the existing bowl logo asset, `src/assets/bowl-illustration-v3.webp`,
  beside the Movie Bowl wordmark. Do not redraw, recolor, or replace that bowl
  as part of this work; the filmstrip belongs only to the Add action.
- The logo points to `/`, labeled `Go to your default bowl`. `/` resolves the
  account default. My Bowls remains in the menu and keeps its activity ordering.
- No Add button on logged-out pages, login, public add-link pages, or `/tv/*`.
  Preserve the existing shell's route visibility; a signed-in About page does
  get the button. The default does not replace the TV's bowl picker.

## Add dialog layout

```text
Add a movie                                      [ X ]
Add to [ Friday Night v ]
[ Search movies…                               ] [mic]
Comment (optional)                               [Add]

[poster] Sinners                                    [Add]
         2025                                  [Details]
         streaming information
```

| Element | Specification |
| --- | --- |
| Surface | Existing dark `modal-surface`, 24px corner radius; add-flow width capped at 640px |
| Phone spacing | 16px horizontal viewport gutter; 16px internal padding |
| Desktop spacing | 24px internal padding; centered surface |
| Vertical fit | At most the available visual viewport minus 32px, including when the keyboard is open; scroll inside the dialog |
| Heading | `Add a movie`, 20px, semibold; existing close control at top right, 44px hit area |
| Destination row | Plain Add to text followed by a compact Friday Night + chevron control; minimum 44px hit area; high-contrast bowl name |
| Search | Existing `input-field`, 16px input text, minimum 44px tall; retain the mic only where already supported |
| Spacing | 12px between heading, destination, and search groups; 8px between result rows |
| Results | Existing poster, title/year, provider information, Add and Details; preserve their functionality |
| Comment | Existing collapsed `Comment (optional)` control; retain its 500-character limit and draft preview |

Use the existing slate surfaces, borders, rose accents, and focus tokens from
`src/index.css`. Do not globally restyle `AddMovieModal`: its drawn-movie and
watched-detail presentations are outside this redesign.

Keep the heading, destination, search field, and feedback in one sticky header.
Comments and results scroll together below it. Remove competing nested result
scroll containers for this flow. On short screens and with the software
keyboard open, the close control and destination must stay reachable; the
comment panel must not push search off screen. Long bowl names wrap in the
destination row. The full destination must be readable before submission.

An empty search has no extra instructional sentence below the form. The
`Search movies…` placeholder is enough; do not show "Find a movie for your next
movie night."

## Destination selector

With one accessible bowl, render `Add to Friday Night` as plain text: no
chevron, fake disabled picker, or extra step.

With multiple bowls, keep `Add to` as plain text and make only the bowl name
and its adjacent chevron a compact dropdown button: `Add to [Friday Night v]`.
Use a subtle bordered, rounded surface around that button so the name reads
as a selectable bowl. The chevron sits 8px after the name, never at the far
edge of the dialog. The control sizes to its content, has a 44px minimum hit
height, and wraps long names within the available width. Accessible name:
`Choose bowl. Current bowl: Friday Night`.

Expand the choices directly beneath the bowl-name button, aligned with its
left edge, within the dialog's right edge. Keep the trigger and its choices
together: the order is destination row, bowl choices, then movie search. Never
put the search field or feedback between the trigger and its choices. Leave
an 8px gap above the first choice and 12px between the last choice and search.

Cap the choices at 224px, roughly four rows, and scroll only that list when
there are more bowls. Reduce the cap on short screens or with the software
keyboard open so the bowl-name control and movie search remain visible. Long
names can make rows taller; never shrink text or hit areas to fit more rows.
Support touch, wheel, and keyboard scrolling, contain scroll within the list,
and bring the current selection into view when it opens without reordering
the bowls. Keyboard focus must also scroll a choice into view when needed.

While the selector is expanded, hide the results/comment area temporarily to
keep the dialog compact. Search remains below the complete selector with its
draft intact. No second modal, route navigation, or bowl search field.

Each row shows the bowl name; the saved default also has a quiet `Default`
label. A check marks the current add destination. Use that check rather than
an interactive star here: the selector changes this dialog, not the default.
Keep My Bowls' ordering and a 44px minimum row height. Long names wrap; if names
are identical, include owner/member role and a short bowl ID to distinguish
them. Do not add remaining counts to this small selector.

Selecting a row updates the destination and closes the list, preserving the
query, results, and comment. Return focus to search and announce
`Adding to Family Movies`. Escape closes only the selector first. Clicking the
bowl-name button again collapses it without changing the destination. The
`Add to` text itself does not open the selector.

Search-result details retain a visible read-only destination and an
`Add to [bowl name]` action. Return to search to change bowls. Details opened
from existing drawn/watched movies do not gain this destination or add action.

## Search, add, and feedback

1. Open the dialog and focus search. Once the destination is known, show its
   real name before enabling an Add action. Do not flash the last-opened bowl.
2. Preserve current search debounce, keyboard selection, provider lookup,
   details, custom-entry support, and optional comment behavior.
3. On Add, capture the destination ID and submitted movie/comment before any
   asynchronous metadata fetch. Disable all Add actions and the selector until
   that submission settles. Never retarget a pending submission to a newly
   selected or newly defaulted bowl.
4. On confirmed success, announce `Added to Friday Night` in a compact
   `role="status"` row below search. Clear query, results, details, and comment;
   return focus to search, keep the destination, and keep the dialog open.
   The success row clears on the next query or destination change.
5. On failure, preserve the query, details, comment, and intended destination.
   Show the handler's error inside the dialog and re-enable applicable actions.
   A duplicate is a failed addition, not a success that clears the form.

There is no confirmation step and no automatic jump to the destination bowl.
Refresh the affected bowl's count and visible movie list after success without
resetting the current route, filters, or scroll position. Do not show success
for an optimistic row that has not persisted.

Close and Escape dismiss the dialog and discard its unsent draft, matching the
existing lightweight flow. Closing does not cancel a submitted write: the
shared add controller must let it settle without issuing a second request. If
the dialog has closed, show the result in a dismissible shell status banner
under the navigation, naming the movie and destination. Do not automatically
retry a write whose outcome is unknown.

Reopening while a submission is pending reconnects to that same operation,
with its destination fixed and add controls disabled until it settles. For an
unknown outcome, preserve the draft and offer a status check before retrying;
do not present uncertainty as either success or a confirmed failed insert.

## Default bowl and star

| Situation | Rule |
| --- | --- |
| New user gets their first bowl | First bowl created or joined becomes the default |
| Existing account has no saved default at rollout | Most undrawn movies among accessible bowls; ties by alphabetical name, then stable ID |
| Default is left, deleted, or access is revoked | The same most-undrawn rule among remaining accessible bowls |
| No accessible bowls | No default; Home opens My Bowls |
| User selects another star | Save that bowl as their account default |
| Counts change or another bowl is visited | Keep the saved default |

Count persisted undrawn slips across all contributors, without applying draw
filters or streaming preferences. Use one shared deterministic comparison for
rollout and replacement. Save the result once; never overwrite an accessible
saved default during initialization. Offline or failed reads do not prove
that access was lost. Save defaults per account, across devices.

For name ties, compare trimmed names case-insensitively in the database, then
stable ID. Resolve replacement after a local leave/delete commits, or on the
next authoritative refresh for remote access loss. Refresh on app entry,
foreground, Home, My Bowls, and Add open; an already open add session keeps its
displayed destination unless the user explicitly changes it.

On My Bowls, put a star beside the card's `Open` affordance. Match the compact
rounded control treatment of movie pins, with an outlined 18px star for other
bowls and a filled rose star for the default, inside a 44px hit area. The
selected state must be recognizable by shape as well as color. Do not move
the card, change draw behavior, or affect another member's default.

Use `Make [bowl name] my default bowl` for an unselected button's accessible
name and `Default bowl: [bowl name]` for the selected state. Expose the selected
state with `aria-pressed`. Tapping the filled star is a no-op; tapping another
moves the one default. The star is available to owners and members.

Keep the current star until saving succeeds; disable competing star changes
while pending. Success feedback: `[bowl name] is now your default bowl`.
Failure: `Could not change your default bowl. Please try again.` Keep the old
default on failure. Neither star selection nor its feedback opens the bowl.

`BowlCard` is currently one large button. Split it into a card container with
separate open and star controls; never nest a star button inside the existing
button. Preserve the main card's opening affordance and keyboard access.

## Loading, empty, and failure states

| State | Visible behavior |
| --- | --- |
| Default or bowl list loading | Open dialog with `Loading your bowls…`; no enabled add or guessed destination; focus search when ready |
| Bowl list failed | `Could not load your bowls. Please try again.` with Retry; do not initialize or replace a default from this error |
| User has no bowls | `Create or join a bowl to add movies.` with `Go to My Bowls`; no movie search or default-selection prompt |
| Offline | Retain known destination and draft; show existing offline copy and refuse writes; no offline queue |
| Destination at undrawn limit | Surface the existing limit message; let users change destination; do not silently pick another bowl |
| Duplicate, invalid comment, or add failure | Preserve draft and show the existing specific error; do not bypass guards |
| Access to the dialog's destination is lost | Block Add and say `You no longer have access to this bowl. Choose another bowl.`; preserve draft; never silently submit it to the repaired default |
| Default changes on another device while dialog is open | Keep the dialog's displayed, still-accessible destination; use the new default on the next global open |
| Sign-out/account switch | Close and clear the dialog and account state; do not carry drafts, pending feedback, or bowl choices into another account |

When a lost destination leaves just one accessible bowl, still require an
explicit `Use [bowl name]` action before adding the preserved draft there. The
automatic account-default replacement and consent to this specific addition
are separate concerns. With none left, use the no-bowls state.

## Accessibility and overlay behavior

- Use a labeled modal dialog, trap focus, make the background inert, lock
  background scrolling, and restore focus to the invoking Add button on close.
- Show one active dialog at a time. A movie-detail subview is part of the same
  add session; Back returns to the preserved search. Avoid two dialogs reacting
  to the same Escape event. Escape closes the selector first, returns from
  inline details next, then closes the add dialog.
- Use native buttons for destination rows, with a visible selected check and
  accessible selection text. Keep a normal Tab order and Enter/Space activation.
- Use polite status announcements for successful additions, destination
  changes, and default changes; use an alert for errors. Do not rely on color,
  tooltips, or hover to communicate destination or selected state.
- Overlay the fixed navigation rather than letting global Add stay clickable
  behind a detail, draw-confirmation, or add modal. The draw/reveal flow must
  remain protected from a second modal or intercepted keyboard action.
- Preserve visible focus rings and reduced-motion behavior. Avoid a celebratory
  animation or autofocus after unrelated background updates.

## Implementation boundaries

| Existing surface | Intended change |
| --- | --- |
| `src/App.jsx` / `AppShell` | Own one shared add session above bowl routes, scoped to the authenticated user; expose default and explicit-bowl open actions |
| `src/components/TopNav.jsx` | Render the plus/filmstrip Add button and route the existing logo through Home; no data writes in this component |
| `src/screens/HomeRedirect.jsx` | Resolve the saved account default; retire last-opened storage as routing authority |
| `src/screens/MyBowlsScreen.jsx`, `BowlCard.jsx` | Show/save the personal default star without changing list ordering |
| New `BowlAddDialog`, `src/components/AddMovieModal.jsx`, `MovieSearch.jsx` | Share search and an inline detail body in one bowl-add dialog; retain existing detail/history/public behavior in other contexts |
| `src/hooks/useBowl.js` | Share the bowl-add mutation and guards with the shell controller; do not copy its insert logic into navigation |
| `src/screens/BowlDashboard.jsx` | Open the shared dialog with the current bowl ID; remove its separate add dialog and success-close behavior |
| `src/screens/WatchListPage.jsx` | Label manual entry Log a watched movie; retain manual-history writes and removal flow |
| `supabase/migrations/`, `supabase/tests/`, `supabase/rollback/` | Account-owned default persistence, permission checks, initialization, and loss-of-access repair |

The shared add operation must retain authentication and membership checks,
duplicate prevention, in-flight request protection, undrawn-limit checks,
custom-title handling, comment validation, rollback of failed optimistic rows,
and metadata/provider warmups. Use the existing result contract
`{ ok, code, message }`; keep reads and mutations in hooks/data services.
Do not mount a second full draw/dashboard state engine just to add a title.

Any database write of a default must verify that the caller owns the preference
and can access the chosen bowl. Concurrent first-bowl initialization must not
overwrite an existing choice. Add mutations use the submitted bowl ID, never a
fresh lookup of the account default at write time.

## Acceptance and review

- One-bowl user: global Add opens search directly with a readable destination
  and no selector; a successful add stays open and focuses a clean search.
- Two-bowl user: global Add uses the default even while viewing the other bowl;
  contextual Add uses the viewed bowl. Switching preserves the draft and never
  changes the default; closing and reopening restores entry-point behavior.
- My Bowls star: exactly one selected, no navigation/reordering, saved across
  devices, old default retained on failure, same behavior for owner and member.
- Initialization and replacement: most-undrawn selection, name and ID ties,
  all-empty bowls, one remaining bowl, and no bowls; no recomputation on counts.
- Submit then change context/close: exactly one write to the captured bowl;
  correct feedback after completion; no success on a failed write.
- Duplicate, full bowl, offline, permission loss, and invalid comment: clear
  inline error, no wrong-bowl write, no discarded draft, no weakened guard.
- Watch History: global Add creates a bowl slip; Log a watched movie creates
  personal history. Drawn/watched details and public add links still work.
- Keyboard and touch: correct focus return and Escape layers; no background
  activation; test 320px, 390px, and desktop widths, long/duplicate bowl names,
  browser zoom, and a real phone software keyboard.
- Five or more bowls: choices scroll within the capped list while the
  bowl-name control and search stay visible; a selected or keyboard-focused
  choice near the end remains reachable without scrolling the whole dialog.

Implementation requires focused integration tests for the shared flow and
permissions, pgTAP coverage for default writes/repair, the release smoke suite,
and production build per `STABILITY.md`. This document and its sample preview
do not claim that any app behavior or persistence has shipped.

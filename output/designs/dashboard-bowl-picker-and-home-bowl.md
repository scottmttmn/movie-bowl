# Dashboard Bowl Picker and Home Bowl

Status: proposed on September 2, 2026; revised the same day after design
review; not implemented.

This specification supersedes the dashboard navigation, My Bowls navigation,
and default-star presentation in
[`default-bowl-and-global-add.md`](default-bowl-and-global-add.md). It does not
change that design's persistence, fallback selection, global Add destination,
or write-safety rules. The saved `default bowl` remains the data-model term;
the interface calls it the **home bowl**.

## Purpose

Let people switch bowls and choose where Home leads from the page where they
actually use a bowl. Remove My Bowls as a routine navigation stop without
removing the zero-bowl onboarding and recovery route the app still needs.

This design separates two actions that must never be conflated:

- **Open a bowl** changes the bowl being viewed for this visit.
- **Make a bowl home** changes the one saved bowl opened by Home, the logo, and
  global Add. It is available from a single command inside the picker.

Opening a bowl never changes the home bowl. A home bowl cannot be unset; the
designation can only move to another accessible bowl. For that reason, this
design does not use a favorite-style star or `aria-pressed` toggle.

## Product decisions

| Question | Decision |
| --- | --- |
| Where can a person switch bowls? | From the bowl-name picker in every phone/web bowl dashboard header. |
| How is the saved default represented? | A house marker on the home bowl's dashboard hero card, and a non-interactive `Home` badge on its picker and directory rows. |
| Where is the home bowl changed? | From a single `Make [bowl name] home` command inside the bowl picker, acting on the bowl currently being viewed. The dashboard header carries no home command. |
| Does selecting a picker row change Home? | No. It only navigates to that bowl. |
| Can the current home bowl be unassigned? | No. Making another bowl home transfers the single designation. |
| Where are bowls created? | `Create new bowl` in the picker. The existing create flow opens over the current dashboard. |
| What happens to My Bowls? | Remove it from routine menu navigation. `/bowls` remains, always renders, and never automatically redirects. It is the app's one terminal route that shows a list instead of computing another destination. |
| Where are invitations handled? | The permanent `/invites` hub. Do not duplicate invitations in the picker. |
| Where is a bowl managed? | Its existing Bowl Settings page, reached from the dashboard settings button. |
| Does TV change? | No. TV keeps its existing remote-focused picker. |

The companion [Invitations Hub specification](invitations-hub.md) makes that
route a permanent global destination for received, sending, and sent-pending
invitations.

## Prerequisites and delivery sequence

One piece of groundwork must land before this design can be built as written.

**Extract the shared create-bowl controller.** The picker's `Create new bowl`
footer needs the creation flow, and so does the Invitations Hub. It does not
live where it appears to: `src/components/CreateBowlModal.jsx` is presentational
and owns no mutation. The actual flow — bowl insert with its `draw_access_mode`
fallback, owner-membership insert, invite rows, email delivery, and
partial-success messaging — is roughly a hundred lines inside
`src/screens/MyBowlsScreen.jsx`, which remains as a recovery directory but must
stop owning this mutation. Extract it into a shared, tested controller first.
Do not copy it into two callers.

The two specifications are mutually dependent — this one sends invitation work
to the hub, and the hub depends on the picker's replacement navigation — so ship
in this order:

1. Extract and test the shared create-bowl controller.
2. Audit the live schema; add invitation uniqueness, batch creation, and guarded
   revoke, with pgTAP tests and a staged rollback.
3. Ship the dashboard picker, the shared bowl-list primitive, and the home
   designation, **retaining My Bowls in navigation**. Remove My Bowls' default
   stars in this step so the picker becomes the interface's only home write
   control; the directory keeps a non-interactive `Home` marker.
4. Ship the Invitations Hub and remove the duplicate invite mutations from Bowl
   Settings and My Bowls.
5. Remove My Bowls from routine navigation and finish `/bowls` as the manual
   directory, onboarding, and recovery surface.

Navigation removal comes last so no deploy exists in which a menu item has been
removed before its replacement is live.

Steps 3 through 5 may add, remove, or move tests. Refresh the test-count tripwire
in `CLAUDE.md` in the same commit whenever those numbers actually change.

## Dashboard header

### Information hierarchy

The bowl name becomes the primary navigation control. The header carries the
name and nothing else; the home designation lives on the hero card below it.
Filters and Bowl Settings remain utilities on the right.

```text
                         [ Kathryn and Scott's bowl  v ]       [filter] [settings]

                         ┌──────────────────────────── [house] ┐
                         │              (bowl)                 │
                         └─────────────────────────────────────┘
```

The header never carries a home command. Changing the home bowl is a rare,
essentially one-time setting, and a persistent `Make home bowl` button under the
title would occupy prime space on most bowls for most visits. The command lives
in the picker instead, where a person is already thinking about which bowl is
which.

The sketch shows hierarchy, not literal spacing. Center the name within the
content area on wide screens. On narrow screens, let the title
region take the available width to the left of the two utility buttons and
truncate only after giving the title at least half of the row. The complete
name remains available in the picker.

### Bowl-name trigger

- Replace the static dashboard `h1` with a native button containing the bowl
  name and a downward chevron. Keep an `h1` as an accessible page heading,
  either wrapping the button or using screen-reader heading text associated
  with it.
- Match the current title typography: 24px semibold on phone and 30px on
  larger screens. The chevron is 16px, sits 8px after the text, and rotates
  when the picker is open.
- Use no boxed select-field treatment. A subtle hover/focus surface and the
  chevron are sufficient in a page title. Preserve the visible rose focus ring.
- Minimum hit height is 44px. The button must not overlap Filters or Settings.
- Accessible name: `Switch bowl. Current bowl: Kathryn and Scott's bowl`.
- `aria-haspopup="dialog"` and `aria-expanded` describe the picker state.
- With one accessible bowl, retain the chevron and picker because `Create new
  bowl` remains useful. Do not show a disabled or fake selector.

### Home designation

Do not show a star in any state.

When the viewed bowl is home, mark it with a filled house in the top-right
corner of the hero card that holds the bowl illustration:

- Icon only. No visible label. This is passive status a person reads once and
  then stops noticing, so it does not earn a line of copy under the title,
  where it crowded the name and still rendered the house too small to read.
- Roughly 24px, quiet rose on the card's dark ground, anchored to the card
  corner rather than to the illustration -- the image is narrower than the card
  on wide screens, and anchoring to it leaves the marker adrift mid-card.
- Status, not a button: no hover treatment, focus target, `aria-pressed`, or
  click handler.
- Carry the name for assistive technology anyway, through visually hidden text
  and a `title`, so the meaning survives without spending visible space.

When the viewed bowl is not home, nothing renders in that corner. Do not
substitute a placeholder, a muted `Not your home bowl`, or a command. The
command for changing Home lives in the picker; see
[Home command](#home-command).

The house communicates a single destination rather than an independent
favorite. The interface never offers `Remove home`, and tapping the marker does
nothing because it is not interactive.

### Other header actions

- Remove the dashboard Back button. Switching bowls is now available without
  returning to a directory.
- Keep Filters and Bowl Settings in their existing order and 44px targets.
- Bowl Settings always applies to the bowl named in the header.
- Do not add Create, Invite, or membership controls directly to the header.

## Bowl picker

### Surface and responsive behavior

- On screens at least 640px wide, open a 360px-wide popover below the bowl-name
  trigger. Keep it within the viewport and cap its body at 420px.
- Below 640px, open a bottom sheet with 16px side gutters, a 24px top radius,
  and a body capped by the visual viewport. The sheet may grow to fit short
  lists but must leave the fixed application navigation visible only if it
  cannot be activated behind the sheet.
- Use the existing dark modal/popover surfaces, slate borders, rose focus
  tokens, and shadow language. Do not introduce a new visual system.
- Heading: `Choose a bowl`. Include a 44px close button on the sheet. The
  desktop popover may close through the trigger, Escape, or an outside click.
- On phone, lock background scrolling and trap focus. Restore focus to the
  bowl-name trigger on dismissal without navigation.

### Ordering and grouping

Use the existing shared `orderBowlChoices` behavior:

1. `Owned by you`, ordered by recent activity and then the existing stable
   tie-breakers.
2. `Shared with you`, using the same ordering.

Do not move the home bowl or current bowl to the top. Their markers are enough,
and one ordering rule applied to every row is easier to reason about than a
pinned exception. Be precise about what that buys: the ordering is
deterministic, not positionally stable. It leads with recent activity, so a
bowl's position can move between visits. This design cannot promise positional
muscle memory, which is a further reason the markers, not the positions, carry
the meaning.

Omit an empty group. If names collide within a group, add enough secondary
identity to distinguish them, using member/owner context and a short stable ID
only when necessary.

### Shared list primitive

The picker and `/bowls` directory render the same owned/shared groups, activity
ordering, count wording, `Home` marker, duplicate-name disambiguation, and
accessible row labels. Implement that behavior once in a shared grouped-list
component rather than maintaining two filter/map trees.

The shared component owns group construction and the row content contract. It
may expose compact picker and roomier directory variants, but a variant may
change only layout density and surrounding surface treatment — not ordering,
labels, markers, identity rules, or selection meaning. The picker alone adds
the current-row check and the separate home command. `/bowls` never adds a home
write control.

### Picker rows

Each row is one navigation button with:

- bowl name, wrapping to two lines before truncation;
- quiet secondary text such as `12 to draw` and `3 members`, using the counts
  already returned by the shared bowl context. The available count in
  `get_my_bowl_context` is `remaining_count` — undrawn titles, not everything
  the bowl has ever held — so the copy must not say `12 movies`;
- a check on the bowl currently being viewed;
- a compact `Home` badge on the saved home bowl.

The current check and Home badge can appear on the same row. They mean different
things and must not be merged. Do not put a star, house button, radio, or
favorite toggle at the trailing edge of each row.

Rows have a 52px minimum height and a normal visible focus state. Accessible
names include state when relevant, for example:
`Friday Night, current bowl, 12 to draw, 3 members` and
`Family Movies, home bowl, 8 to draw, 2 members`.

Selecting a row:

1. closes the picker;
2. pushes `/bowl/:bowlId` onto history, so browser Back returns to the bowl the
   person came from. Redirects, and leave/delete recovery, continue to use
   replace. Push matters more here than it looks: the header's Back button is
   gone, so history is the only route back to the previously viewed bowl;
3. preserves the saved home bowl;
4. loads the selected bowl's own dashboard state and scroll position from the
   top; and
5. places focus on the new page heading after navigation.

Selecting the current row only closes the picker. It does not reload the bowl
or change Home.

### Home command

Below the scrollable rows and above `Create new bowl`, show one home command
that acts on the bowl currently being viewed:

```text
[house] Make Friday Night home
──────────────────────────────
[  +  ] Create new bowl
```

- Show it only when the viewed bowl is not already home. On the home bowl the
  slot is absent, because that bowl's row already carries the `Home` badge.
- Visible label is `Make [bowl name] home`, truncated to one line when the name
  is long. Accessible name is `Make [bowl name] my home bowl`, with the full
  name.
- There is exactly one home control in the interface and it targets exactly one
  bowl: the one named in the header. Do not add a home control, star, radio, or
  house button to individual picker rows. A per-row control implies Home is a
  per-row toggle that can be switched off, which it cannot.
- Activating it saves the existing account default. It does not navigate, close
  the picker, reorder the rows, open Add, or affect any other member.
- During the write, keep the old home designation authoritative everywhere,
  label the command `Making home…`, and disable further home changes.
- On success, move the `Home` badge to the current bowl's row, remove the
  command, show the `Home bowl` badge in the header behind the picker, and
  announce `[bowl name] is now your home bowl` in a polite live region. Keep the
  picker open so the change is visible where it was made.
- On failure, retain the command and show `Could not change your home bowl.
  Please try again.` inside the picker, directly above the command. Do not close
  the picker on failure.
- While bowl context is still loading, reserve the footer position with neutral,
  non-focusable `Checking home bowl…` status. Do not render a disabled
  `Make … home` command before authoritative context proves the viewed bowl is
  not already Home. Once resolved, replace the status with the command or
  remove the slot when the viewed bowl is Home.

### Picker footer

Pin a footer below the scrollable bowl rows:

```text
[ + ] Create new bowl
```

- The action is always visible unless the owned-bowl limit has been reached.
  At the limit, keep it disabled with the existing limit explanation.
- Opening Create closes the picker and opens the existing create-bowl dialog.
- Preserve bowl name, invite-email parsing, account limits, and partial invite
  failure behavior from the current My Bowls flow, by way of the shared
  create-bowl controller described in Prerequisites — not by reimplementing
  them in the picker.
- After successful creation, close the dialog and navigate directly to the new
  bowl. The first accessible bowl becomes home under the existing database
  rule; later bowls do not replace an accessible home bowl.
- Do not add `Manage all bowls` or `My Bowls` to the footer. Per-bowl management
  already lives in Bowl Settings.

## My Bowls navigation and recovery routing

### Navigation

- Remove `My Bowls` from the top-navigation menu. Removing it from the menu is
  not the same as removing the route from the interface: every resolution
  failure and confirmed access-loss state links to it as `Browse bowls`, so the
  user always has an action besides Retry.
- Keep `Invitations`, including its pending-count badge.
- Point the Movie Bowl logo at the home bowl once the account context knows
  which bowl that is, falling back to `/` until it does. Accessible label stays
  `Go to your home bowl`. Always routing through `/` meant tapping the logo on
  the home bowl left the dashboard and came back, remounting it -- a visible
  flicker for what should be a no-op. `/` remains the resolver for direct
  visits, bookmarks and the logo's fallback.
- Rename user-facing references from `default bowl` to `home bowl` where they
  describe the feature. Database objects, function names, and internal code may
  retain `default`.

### `/bowls`

Retain the route, stop treating it as a signed-in user's routine home page, and
give it exactly one job: **render**. `/bowls` never automatically redirects.

The division of labor is:

- `/` is the automatic Home resolver. It computes a destination.
- `/bowls` is the manual bowl directory, onboarding, and recovery surface. It
  computes nothing and always shows something.

That split is the point. Every other route in the signed-in app resolves toward
Home, so if Home resolution is wrong there must be one place that will still
render a list. Do not add a second mode, query flag, or conditional redirect to
this route; two subtly different behaviors on one URL is the failure this rule
exists to prevent.

| State | Behavior |
| --- | --- |
| Context is loading with no prior data | Show `Loading your bowls…`. Do not guess a destination. |
| Context refresh fails but last-good bowls exist | **Render those bowls** and show the error alongside them, with Retry. The list stays usable. |
| Context fails with no trustworthy list | Show the error and Retry, and stay on this route. Do not navigate anywhere else. |
| One or more accessible bowls | Render the directory, grouped and ordered exactly as the picker is. Do not redirect. |
| No accessible bowls and no pending invites | Show the first-bowl onboarding and Create action. |
| No accessible bowls with pending invites | Show a prominent `Review invitations` action linking to `/invites`, plus Create. Do not duplicate the full invite list. |

Opening a bowl from this directory navigates to it and **does not change Home**,
exactly as the picker behaves. The directory carries the same `Home` marker and
no per-row home control.

Rendering last-good rows is a requirement, not an optimization, and it is the
part most easily missed: `MyBowlsScreen` consumes the same `useUserBowls`
context whose failure sends people here, so this is not an independent recovery
path. Retaining the route is insufficient on its own. The hook already
preserves previously loaded bowls when a refresh fails — its error branch keeps
prior state and sets only `loading` and `error` — so the screen must render
that retained list rather than swapping to an error-only view. A recovery
surface that goes blank in exactly the conditions that send people to it is not
a recovery surface.

Old `/bowls` bookmarks therefore remain safe, and become more useful than
before: they always land somewhere that renders.

### Leave and delete

- After leaving or deleting the bowl currently being viewed, resolve the
  authoritative bowl context and replace-navigate through `/`.
- If the home bowl still exists, `/` opens it.
- If the removed bowl was home, existing fallback rules choose and persist a
  replacement before navigation.
- If no bowls remain, `/` leads to the `/bowls` onboarding state.
- A network failure is not evidence that the home bowl disappeared. Show Retry
  and `Browse bowls` rather than selecting or navigating to a guessed
  replacement.

### Direct links

An explicit `/bowl/:bowlId` link continues to open that accessible bowl without
changing Home. If access is definitively absent, resolve context and return
through `/`. Transport errors keep their existing retry state.

Allow at most one automatic hop out of a bowl. If `/` resolves back to the same
bowl that just reported confirmed access loss, stop: render the error with
Retry and `Browse bowls` instead of navigating again. Server-side repair makes
this unlikely — `_ensure_user_bowl_default` reassigns an unreachable default
under an advisory lock and `get_my_bowl_context` retries — and the client's
`Inconsistent bowl context` assertion in `useUserBowls` catches a response that
should be impossible. Do not loosen that assertion to paper over a loop; the
hop limit is the guard.

## Global Add relationship

The existing global Add behavior remains unchanged except for language:

- Global Add starts at the saved home bowl.
- `Add to this bowl` starts at the bowl currently being viewed.
- Switching dashboards does not change the next global Add destination.
- Changing the home bowl does not retarget an Add dialog that is already open.
- The Add destination selector marks the home bowl with a quiet `Home` label,
  not a star. Choosing an Add destination does not make it home.

## Loading, empty, and failure states

| State | Visible behavior |
| --- | --- |
| Bowl context refreshes with last good data | Keep the header and picker usable except for writes whose authority is uncertain; show a restrained refresh state only when needed. |
| Bowl context loads without prior data | Show a title skeleton and disable picker/home actions until resolved. |
| Picker load fails | Keep the current bowl visible and show `Could not load your bowls. Try again.` with Retry inside the picker. |
| Home save fails | Keep the previous home marker everywhere and show the error inside the picker, next to the command that failed. |
| Viewed bowl disappears remotely | After confirmed access loss, resolve and navigate through `/`; never infer loss from a timeout, and never hop more than once. |
| Create succeeds but invites fail | Open the created bowl and show the existing partial-success message there. |
| User is offline | Allow navigation only to already available app routes; do not save Home or create a bowl. State clearly that the change requires a connection. |

## Accessibility and keyboard behavior

- Use buttons for actions and navigation rows; do not place interactive home
  controls inside the bowl-name trigger or inside a bowl row. The picker's one
  home command is a sibling of the rows, not a child of any of them.
- The trigger has a visible text name, chevron, expanded state, and dialog
  relationship. Do not rely on the icon alone.
- On open, focus the current bowl row; if it is not rendered because data is
  loading, focus the picker heading or Retry action.
- Arrow keys may move focus between bowl rows, but normal Tab navigation must
  continue to work. Enter or Space opens the focused bowl.
- Escape closes the create dialog first, then the picker, then any enclosing
  page overlay according to the existing overlay stack.
- Announce completed navigation through the new page heading. Announce Home
  changes and errors through the existing status regions.
- In the picker, communicate current and Home states in text as well as with a
  check, house, or color; those rows are how a person compares bowls. The
  dashboard marker is deliberately icon-only, and carries its name through
  visually hidden text instead.
- Respect reduced motion. Limit the chevron rotation and sheet movement to the
  app's existing reduced-motion behavior.

## Analytics and validation questions

If product analytics are available, distinguish:

- picker opened;
- bowl switched;
- create opened from picker;
- home-bowl change attempted/succeeded/failed; and
- `/bowls` opened directly versus from recovery, and directory versus
  onboarding presentation.

The design is successful when frequent users can move between bowls without
opening a directory, no usability participant expects to "un-home" the home
bowl, and new users can still create or join their first bowl without reaching
a dead end.

## Implementation boundaries

| Existing surface | Intended change |
| --- | --- |
| `src/screens/BowlDashboard.jsx` | Replace Back/static title with the picker trigger; show the `Home bowl` badge only on the home bowl. Retain Filters and Bowl Settings. |
| New dashboard picker component | Render responsive popover/sheet behavior, the single home command, and the Create entry point around the shared grouped-list component. |
| New shared grouped-list component | Own the picker/directory grouping, activity ordering, count copy, Home marker, duplicate-name rules, and accessible row labels, with compact and directory layout variants. |
| `src/components/BowlCard.jsx` | Fold its useful directory presentation into the shared grouped-list component or retire it; do not leave a second independent row/card mapper that can drift. |
| `src/hooks/useUserBowls.js` | Continue as the authoritative shared bowl list and home-bowl writer; do not create a parallel dashboard query. |
| Shared create-bowl controller (new) | See Prerequisites. Extract the creation mutation out of `MyBowlsScreen.jsx` before the picker calls it. |
| `src/components/CreateBowlModal.jsx` | Stays presentational. It owns no mutation today and must not acquire one; keep mutations out of the visual picker component too. |
| `src/components/TopNav.jsx` | Remove My Bowls and change accessible `default` wording to `home`. Cover the removal with tests; the menu's contents are asserted behavior, not incidental markup. |
| `src/screens/MyBowlsScreen.jsx` | Becomes the always-rendering directory, onboarding, and recovery surface. Never add automatic redirect behavior; remove its default stars, received-invitation list, and embedded create mutation; render the shared grouped-list component and keep last-good bowls visible when a refresh fails. |
| `src/screens/HomeRedirect.jsx` | Keep authoritative home resolution; route zero-bowl accounts to onboarding. Its existing failure-state link to `/bowls` stays and is relabeled `Browse bowls` — that link is the escape hatch, and it only works because `/bowls` no longer redirects. |
| `src/screens/BowlSettings.jsx` | After leave/delete, resolve through Home instead of navigating to a directory. |
| `src/components/BowlAddDialog.jsx` | Change visible `Default` labels to `Home`; do not change destination semantics. |
| TV files | No change. |

The picker, directory, and home-bowl changes themselves require no database
migration. Continue using `user_bowl_defaults`, `get_my_bowl_context`, and
`set_my_default_bowl`. The companion Invitations Hub has its own required
database work. Do not rename deployed database objects merely to match the new
user-facing term.

### Terminology mapping

The interface says **home bowl**; the database says **default**. That drift is
deliberate and permanent, so record it rather than leaving every later reader to
rediscover it:

| User-facing term | Database object |
| --- | --- |
| Home bowl | the account's `user_bowl_defaults` row |
| Resolving Home | `get_my_bowl_context` → `default_bowl_id` |
| `Make [bowl name] home` | `set_my_default_bowl` |

Add this mapping to the data-model section of `CLAUDE.md` in the same change
that ships the rename, so a later session reading `set_my_default_bowl` does not
have to work out whether it is the same feature as the `Home bowl` badge.

## Verification

Cover at minimum:

- one, several, and many bowls across Owned and Shared groups;
- picker and directory variants producing identical groups, ordering, count
  wording, Home markers, duplicate-name disambiguation, and accessible labels;
- duplicate and very long names;
- row counts reading as undrawn titles, including a bowl whose titles have all
  been drawn;
- switching bowls without changing Home, and browser Back returning to the
  previously viewed bowl;
- making a non-home bowl home from inside the picker, with every marker
  updating while the rows neither reorder nor close;
- a non-home bowl showing no home marker and no home control at all;
- My Bowls retaining no default-star control once the picker ships;
- picker loading showing neutral `Checking home bowl…` status rather than a
  false disabled command;
- clicking/tapping the `Home bowl` badge is impossible because it is not a
  control;
- save failure retains the old home designation;
- creating a first and subsequent bowl from the picker;
- the owned-bowl creation limit;
- pending invitations with zero bowls;
- a stale or inconsistent Home alongside other accessible bowls;
- Home resolution failing while last-good bowl data exists, with `/bowls`
  rendering those rows rather than an error-only view;
- confirmed access loss resolving without a `/ → bowl → /` loop;
- direct `/bowls` access never redirecting, in every context state;
- manually opening another bowl from the directory without changing Home;
- old `/bowls` bookmarks with and without bowls;
- leave/delete of home and non-home bowls;
- direct links, foreground refresh, account switch, offline, and confirmed
  remote access loss;
- mobile keyboard, bottom-sheet focus trap, desktop outside-click dismissal,
  Escape, Tab, arrow keys, 200% zoom, and reduced motion; and
- global Add still uses Home while contextual Add still uses the viewed bowl.

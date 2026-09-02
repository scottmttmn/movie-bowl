# Dashboard Bowl Picker and Home Bowl

Status: proposed on September 2, 2026; not implemented.

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
- **Make home bowl** changes the one saved bowl opened by Home, the logo, and
  global Add.

Opening a bowl never changes the home bowl. A home bowl cannot be unset; the
designation can only move to another accessible bowl. For that reason, this
design does not use a favorite-style star or `aria-pressed` toggle.

## Product decisions

| Question | Decision |
| --- | --- |
| Where can a person switch bowls? | From the bowl-name picker in every phone/web bowl dashboard header. |
| How is the saved default represented? | As a home designation: a non-interactive `Home bowl` badge on the home bowl and an explicit `Make home bowl` command on every other bowl. |
| Does selecting a picker row change Home? | No. It only navigates to that bowl. |
| Can the current home bowl be unassigned? | No. Making another bowl home transfers the single designation. |
| Where are bowls created? | `Create new bowl` in the picker. The existing create flow opens over the current dashboard. |
| What happens to My Bowls? | Remove it from normal navigation. Retain `/bowls` for zero-bowl onboarding, loading/recovery, and old bookmarks. |
| Where are invitations handled? | The permanent `/invites` hub. Do not duplicate invitations in the picker. |
| Where is a bowl managed? | Its existing Bowl Settings page, reached from the dashboard settings button. |
| Does TV change? | No. TV keeps its existing remote-focused picker. |

The companion [Invitations Hub specification](invitations-hub.md) makes that
route a permanent global destination for received, sending, and sent-pending
invitations.

## Dashboard header

### Information hierarchy

The bowl name becomes the primary navigation control. The home designation is
secondary and appears immediately below it. Filters and Bowl Settings remain
utilities on the right.

Home bowl:

```text
                         [ Kathryn and Scott's bowl  v ]       [filter] [settings]
                                  [house] Home bowl
```

Another bowl:

```text
                              [ Friday Night  v ]              [filter] [settings]
                              [house] Make home bowl
```

The sketches show hierarchy, not literal spacing. Center the name and home
line within the content area on wide screens. On narrow screens, let the title
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

Do not show a star in either state.

When the viewed bowl is home:

- Show a compact, non-interactive badge with a small filled house icon and the
  text `Home bowl`.
- The badge is status, not a button. It has no hover treatment, focus target,
  `aria-pressed`, or click handler.
- Use a quiet rose-on-dark treatment so it is recognizable without competing
  with Draw.

When the viewed bowl is not home:

- Show a compact tertiary button with an outlined house icon and the visible
  text `Make home bowl`.
- Accessible name: `Make [bowl name] my home bowl`.
- Activating it saves the existing account default. It does not navigate,
  reorder the picker, open Add, or affect any other member.
- During the write, keep the old home designation authoritative, label the
  command `Making home…`, and disable further home changes.
- On success, replace the command with the `Home bowl` badge and announce
  `[bowl name] is now your home bowl` in a polite live region.
- On failure, retain `Make home bowl` and show
  `Could not change your home bowl. Please try again.` near the header.

The house and wording communicate a single destination rather than an
independent favorite. The interface never offers `Remove home`, and tapping
the `Home bowl` status does nothing because it is not interactive.

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
and stable ordering makes the list learnable.

Omit an empty group. If names collide within a group, add enough secondary
identity to distinguish them, using member/owner context and a short stable ID
only when necessary.

### Picker rows

Each row is one navigation button with:

- bowl name, wrapping to two lines before truncation;
- quiet secondary text such as `12 movies` and `3 members`, using the counts
  already returned by the shared bowl context;
- a check on the bowl currently being viewed;
- a compact `Home` badge on the saved home bowl.

The current check and Home badge can appear on the same row. They mean different
things and must not be merged. Do not put a star, house button, radio, or
favorite toggle at the trailing edge of each row.

Rows have a 52px minimum height and a normal visible focus state. Accessible
names include state when relevant, for example:
`Friday Night, current bowl, 12 movies, 3 members` and
`Family Movies, home bowl, 8 movies, 2 members`.

Selecting a row:

1. closes the picker;
2. navigates to `/bowl/:bowlId`;
3. preserves the saved home bowl;
4. loads the selected bowl's own dashboard state and scroll position from the
   top; and
5. places focus on the new page heading after navigation.

Selecting the current row only closes the picker. It does not reload the bowl
or change Home.

### Picker footer

Pin a footer below the scrollable bowl rows:

```text
[ + ] Create new bowl
```

- The action is always visible unless the owned-bowl limit has been reached.
  At the limit, keep it disabled with the existing limit explanation.
- Opening Create closes the picker and opens the existing create-bowl dialog.
- Preserve bowl name, invite-email parsing, account limits, and partial invite
  failure behavior from the current My Bowls flow.
- After successful creation, close the dialog and navigate directly to the new
  bowl. The first accessible bowl becomes home under the existing database
  rule; later bowls do not replace an accessible home bowl.
- Do not add `Manage all bowls` or `My Bowls` to the footer. Per-bowl management
  already lives in Bowl Settings.

## My Bowls retirement and routing

### Navigation

- Remove `My Bowls` from the top-navigation menu.
- Keep `Invites`, including its pending-count badge.
- Keep the Movie Bowl logo pointed at `/`, with accessible label
  `Go to your home bowl`.
- Rename user-facing references from `default bowl` to `home bowl` where they
  describe the feature. Database objects, function names, and internal code may
  retain `default`.

### `/bowls`

Retain the route, but stop treating it as a signed-in user's routine home page.

| State | Behavior |
| --- | --- |
| Context is loading | Show `Loading your bowls…`; do not guess a destination. |
| Context failed | Keep the last good state when available; otherwise show Retry. |
| One or more accessible bowls | Replace-navigate to the saved home bowl. If the saved choice requires authoritative repair, complete that repair first. |
| No accessible bowls and no pending invites | Show the existing first-bowl onboarding and Create action. |
| No accessible bowls with pending invites | Show a prominent `Review invitations` action linking to `/invites`, plus Create. Do not duplicate the full invite list. |

Old `/bowls` bookmarks therefore remain safe. They either lead to Home or to
the only directory-like state that still matters: acquiring a first bowl.

### Leave and delete

- After leaving or deleting the bowl currently being viewed, resolve the
  authoritative bowl context and replace-navigate through `/`.
- If the home bowl still exists, `/` opens it.
- If the removed bowl was home, existing fallback rules choose and persist a
  replacement before navigation.
- If no bowls remain, `/` leads to the `/bowls` onboarding state.
- A network failure is not evidence that the home bowl disappeared. Show Retry
  rather than selecting or navigating to a guessed replacement.

### Direct links

An explicit `/bowl/:bowlId` link continues to open that accessible bowl without
changing Home. If access is definitively absent, resolve context and return
through `/`. Transport errors keep their existing retry state.

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
| Home save fails | Keep the previous home marker everywhere and show the header error. |
| Viewed bowl disappears remotely | After confirmed access loss, resolve and navigate through `/`; never infer loss from a timeout. |
| Create succeeds but invites fail | Open the created bowl and show the existing partial-success message there. |
| User is offline | Allow navigation only to already available app routes; do not save Home or create a bowl. State clearly that the change requires a connection. |

## Accessibility and keyboard behavior

- Use buttons for actions and navigation rows; do not place interactive home
  controls inside the bowl-name trigger or picker rows.
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
- Communicate current and Home states in text as well as with a check, house,
  or color. The `Home bowl` badge is readable at 200% zoom.
- Respect reduced motion. Limit the chevron rotation and sheet movement to the
  app's existing reduced-motion behavior.

## Analytics and validation questions

If product analytics are available, distinguish:

- picker opened;
- bowl switched;
- create opened from picker;
- home-bowl change attempted/succeeded/failed; and
- `/bowls` redirected versus shown as onboarding.

The design is successful when frequent users can move between bowls without
opening a directory, no usability participant expects to "un-home" the home
bowl, and new users can still create or join their first bowl without reaching
a dead end.

## Implementation boundaries

| Existing surface | Intended change |
| --- | --- |
| `src/screens/BowlDashboard.jsx` | Replace Back/static title with the picker trigger and home designation; retain Filters and Bowl Settings. |
| New dashboard picker component | Render grouped bowl rows, responsive popover/sheet behavior, counts, current/Home markers, and Create entry point. |
| `src/hooks/useUserBowls.js` | Continue as the authoritative shared bowl list and home-bowl writer; do not create a parallel dashboard query. |
| `src/components/CreateBowlModal.jsx` and create data flow | Make the existing creation flow callable from the picker; keep mutations out of the visual picker component. |
| `src/components/TopNav.jsx` | Remove My Bowls and change accessible `default` wording to `home`. |
| `src/screens/MyBowlsScreen.jsx` | Reduce to zero-bowl onboarding/recovery or replace with a focused onboarding screen while retaining `/bowls`. |
| `src/screens/HomeRedirect.jsx` | Keep authoritative home resolution; route zero-bowl accounts to onboarding. |
| `src/screens/BowlSettings.jsx` | After leave/delete, resolve through Home instead of navigating to a directory. |
| `src/components/BowlAddDialog.jsx` | Change visible `Default` labels to `Home`; do not change destination semantics. |
| TV files | No change. |

No database migration is required. Continue using `user_bowl_defaults`,
`get_my_bowl_context`, and `set_my_default_bowl`. Do not rename deployed
database objects merely to match the new user-facing term.

## Verification

Cover at minimum:

- one, several, and many bowls across Owned and Shared groups;
- duplicate and very long names;
- switching bowls without changing Home;
- making a non-home bowl home and seeing all markers update without reorder;
- clicking/tapping the `Home bowl` badge is impossible because it is not a
  control;
- save failure retains the old home designation;
- creating a first and subsequent bowl from the picker;
- the owned-bowl creation limit;
- pending invitations with zero bowls;
- old `/bowls` bookmarks with and without bowls;
- leave/delete of home and non-home bowls;
- direct links, foreground refresh, account switch, offline, and confirmed
  remote access loss;
- mobile keyboard, bottom-sheet focus trap, desktop outside-click dismissal,
  Escape, Tab, arrow keys, 200% zoom, and reduced motion; and
- global Add still uses Home while contextual Add still uses the viewed bowl.

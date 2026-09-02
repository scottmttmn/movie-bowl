# Invitations Hub

Status: proposed on September 2, 2026; not implemented.

This specification expands the existing `/invites` inbox into a stable,
global Invitations hub. It complements
[`dashboard-bowl-picker-and-home-bowl.md`](dashboard-bowl-picker-and-home-bowl.md),
which removes My Bowls from normal navigation. It preserves the current
owner-only invitation permissions, acceptance behavior, email delivery, and
invite-link model.

## Purpose

Give invitations a permanent, understandable home where a person can:

- respond to invitations they received;
- invite people to bowls they own; and
- manage invitations they sent that have not yet been accepted.

The hub separates **received** and **sent** invitations in its language and
layout. It does not combine invitations with members, public Add links, or
general notifications.

## Product decisions

| Question | Decision |
| --- | --- |
| Is Invitations always in the main menu? | Yes. The destination is stable whether or not anything is pending. |
| What does the navigation badge count? | Only received invitations waiting for this user to accept or decline. Sent invitations do not contribute to the badge. |
| Who can send? | A bowl owner can invite people to that owned bowl. Membership alone does not grant invitation authority. |
| Where are invitations sent? | From the global Invitations hub, with an explicit bowl destination. |
| What remains in Bowl Settings? | The member roster and member removal. Its invitation area becomes a contextual link into the hub with that bowl preselected. |
| Where are sent invitations managed? | In the hub's `Pending invitations sent` section, where the owner can copy a link or revoke. |
| Does the first version show invitation history? | No. It shows actionable received invitations and unaccepted sent invitations, not a permanent accepted/declined audit log. |
| Are public Add links included? | No. They allow movie submissions rather than bowl membership and remain in Bowl Settings → Add links. |

## Information architecture

Route: `/invites`

Menu item:

```text
Invitations          2
```

Show `Invitations` at all times for authenticated phone/web users. Render the
rose count badge only when one or more received invitations need a response.
Keep the badge capped at `9+` using the existing navigation convention.

Page title and introduction:

```text
Invitations
Join a bowl or invite people to one you own.
```

Use three sections in this order on phone:

1. Received invitations
2. Invite people
3. Pending invitations sent

Do not use tabs. Volumes are expected to be small, and the three sections have
different jobs that benefit from being simultaneously discoverable.

On desktop, use a two-column layout:

```text
┌───────────────────────────────────────┬─────────────────────────────┐
│ Received invitations             (2) │ Invite people               │
│ ┌───────────────────────────────────┐ │ Bowl                        │
│ │ Friday Night                     │ │ [ Choose a bowl          v] │
│ │ Invited by alex@example.com      │ │ Email addresses             │
│ │ [Accept] [Decline]               │ │ [                         ] │
│ └───────────────────────────────────┘ │ [Send invitations]          │
│                                       │                             │
│ Pending invitations sent         (3) │                             │
│ ┌───────────────────────────────────┐ │                             │
│ │ friend@example.com               │ │                             │
│ │ Kathryn and Scott's bowl         │ │                             │
│ │ [Copy link] [Revoke]             │ │                             │
│ └───────────────────────────────────┘ │                             │
└───────────────────────────────────────┴─────────────────────────────┘
```

The main column is flexible. The send card is 320–384px wide and may remain
sticky below the fixed application navigation while the invitation lists
scroll. At widths below 900px, use the phone section order and normal document
flow. Never make the page itself a modal.

## Received invitations

### Section heading

```text
Received invitations                                      2 pending
Invitations sent to scott@example.com.
```

Use the authenticated account email in the explanatory line so a person can
understand why an expected invitation may not appear. Do not expose another
account's address.

### Invitation card

Each received card shows:

- bowl name as the card heading;
- inviter email when available;
- relative sent date;
- `Accept` as the primary action; and
- `Decline` as a quiet destructive/secondary action.

Example:

```text
Friday Night                                      2 hours ago
Invited by alex@example.com

[ Accept invitation ]  [ Decline ]
```

Accessible heading: `[bowl name] invitation`. The action names include the bowl
when needed: `Accept invitation to Friday Night` and
`Decline invitation to Friday Night`.

### Accept behavior

1. Disable both actions on that card and label the primary action `Joining…`.
2. Use the existing atomic acceptance operation. Do not add membership and
   update the invitation in separate client writes.
3. On success, remove the card, refresh the shared bowl context and badge, and
   navigate to the joined bowl.
4. Acquiring a first bowl may initialize it as Home under the existing default
   rules. Joining another bowl does not replace an accessible Home bowl.
5. On failure, retain the card and show its specific error without changing
   bowl context.

### Decline behavior

- Activating `Decline` opens a small confirmation dialog:
  `Decline the invitation to [bowl name]?`
- Actions are `Keep invitation` and `Decline invitation`.
- On success, remove the card and update the navigation badge without leaving
  the page. Announce `Invitation to [bowl name] declined.`
- On failure, retain the card and show the error on it.

The confirmation prevents an easy-to-miss destructive remote/button action
without making acceptance laborious.

### Empty state

Keep the section visible even when empty:

```text
No pending invitations
New bowl invitations sent to scott@example.com will appear here.
```

Use a compact dashed/quiet panel rather than a full-page empty state. Sending
and sent-pending sections remain available below it.

## Invite people

### Eligibility

The bowl selector contains only bowls owned by the current user. Do not show
shared bowls disabled; that implies the permission might be locally unlockable.

Selection rules:

- When opened from Bowl Settings, preselect that accessible owned bowl.
- With exactly one owned bowl, preselect it.
- With several owned bowls from the global menu, start at `Choose a bowl`.
  Do not silently use Home or the last-opened bowl because an invitation grants
  durable membership and is easy to send to the wrong group.
- Preserve the selected destination after successful sends during this visit.
- Never change the account's Home bowl as a side effect.

If the user owns no bowls, replace the form with:

```text
Create a bowl to invite people
You can join shared bowls, but only an owner can invite new members.
[ Create a bowl ]
```

`Create a bowl` opens the shared create-bowl flow. It must work for someone who
belongs only to shared bowls; do not route them through `/bowls`, which may
redirect to Home.

### Form

```text
Invite people
They'll receive an email and join after accepting.

Bowl
[ Choose a bowl                                      v ]

Email addresses
[ friend@example.com, family@example.com               ]
Separate multiple addresses with commas, spaces, or new lines.

[ Send invitations ]
```

- Use the existing compact bowl-choice ordering for owned bowls, with names
  wrapping as needed. Show the selected bowl in full before submission.
- Use a multiline email field so the existing multi-address parsing is useful.
- Normalize and de-duplicate addresses within the submitted batch.
- Show invalid addresses inline before creating any invitation rows.
- Button label is `Send invitation` for one valid address and
  `Send [count] invitations` for several.
- Disable the bowl selector, address field, and submit button while the batch
  settles. Capture the bowl ID and normalized addresses before starting email
  delivery.

### Send results

Invitation-row creation is authoritative; email delivery is a follow-up that
can partially fail.

| Outcome | Feedback |
| --- | --- |
| All invitation rows and emails succeed | `Sent [count] invitation(s) to [bowl name].` |
| Rows succeed and some emails fail | `[count] invitation(s) created, but [failed] email(s) could not be sent. Copy and share their invitation links below.` |
| No invitation row succeeds | Preserve the form and show `Invitations could not be created. Try again.` |
| A response is ambiguous | Preserve entered addresses and check authoritative sent rows before offering Retry. Never create duplicates merely because the email request timed out. |

On confirmed success, clear the submitted addresses, retain the bowl selection,
refresh `Pending invitations sent`, and move keyboard focus to the result
message. Newly created rows appear immediately at the top of their bowl group.

Do not automatically navigate to the bowl or open Bowl Settings after sending.

## Pending invitations sent

### Scope and grouping

Show unaccepted invitations for every bowl the current user owns. Group them by
bowl, ordering bowl groups by the existing activity-first bowl ordering. Within
each group, show the newest invitation first.

The section count is the number of pending sent invitations. It never appears
in the main navigation badge.

Example:

```text
Pending invitations sent                                3 pending

Kathryn and Scott's bowl
friend@example.com                               Yesterday
[ Copy link ]  [ Revoke ]
```

Each row shows recipient email, bowl name/group, relative creation date, and
actions. Long email addresses wrap or truncate with the full value available
to assistive technology and standard pointer disclosure.

### Copy link

- Copy the existing `/accept-invite/:token` URL.
- Announce `Invitation link copied for [email].`
- Do not expose the token in surrounding prose or logs.
- Copying does not alter invitation state or resend email.

### Revoke

- Open a confirmation dialog:
  `Revoke [email]'s invitation to [bowl name]? Their existing link will stop
  working.`
- Actions are `Keep invitation` and `Revoke invitation`.
- On success, remove the row and announce `Invitation revoked for [email].`
- On failure, retain the row and show its error.
- A stale row that has just been accepted should refresh into the member roster
  rather than reporting a successful revoke.

### Empty state

```text
No pending invitations sent
Invitations you send will remain here until they are accepted or revoked.
```

If the user owns no bowls, omit this section after the send-eligibility message.

## Bowl Settings → People

Keep current members and member removal in the bowl-specific People section.
Replace the inline invite form, generated-link panel, and pending-invitation
list with one contextual card for owners:

```text
Invite people
Send or manage invitations for this bowl.
[ Invite people ]                       3 pending
```

- The button navigates to `/invites?bowl=[bowlId]#invite-people`.
- The destination bowl is accepted only after confirming the current user
  still owns it. A foreign, stale, or member-only ID is ignored.
- Focus the `Invite people` heading after navigation and preselect the bowl.
- If pending sent invitations exist, the count links to
  `/invites?bowl=[bowlId]#sent`, with that bowl's group emphasized or filtered.
- Members who are not the owner continue to see the existing explanation that
  only the owner can invite or remove members. Do not show a disabled hub link.

Do not duplicate send/revoke mutations in Bowl Settings. Both contextual and
global entry points use the hub's single data/controller layer.

## Navigation and cross-surface behavior

- Rename the top-navigation item from `Invites` to `Invitations` for clarity.
- Render it for every authenticated phone/web user, even with zero invitations.
- The received-pending badge updates after accept, decline, account switch, app
  foreground, and authoritative reload.
- Remove the received-invitation list from My Bowls as that screen retires.
- Create-bowl invitation fields may remain: inviting initial members is part of
  bowl creation. Successful creation refreshes sent-pending data in the hub.
- Direct email acceptance links remain valid and continue to work without
  visiting the hub first.
- TV does not display or manage invitations.

## Loading, empty, and failure states

Load received invitations, owned bowl choices, and sent invitations
independently so one failure does not erase the other sections.

| State | Behavior |
| --- | --- |
| Received loading | Skeleton/`Checking for invitations…` within Received; keep Send usable if its data is ready. |
| Sent loading | Skeleton within Pending sent; keep Received actions usable. |
| Owned bowls loading | Disable only the send form with `Loading your bowls…`. |
| Received load fails | Show Retry in Received; do not report zero or clear a previously known badge from an ambiguous failure. |
| Sent load fails | Show Retry in Pending sent; preserve the send form and last good rows. |
| Owned-bowl load fails | Preserve entered addresses and show Retry; never guess a destination. |
| Offline | Existing rows may remain readable, but Accept, Decline, Send, Copy-server-dependent recovery, and Revoke explain that a connection is required. Local Copy remains available when a known link is already loaded. |
| Account changes | Clear all invitation rows, form data, selected bowl, links, and messages before loading the new account. |

Never turn a failed request into an empty state. Preserve last good data while
refreshing and prevent stale responses from a previous account or bowl choice
from overwriting current state.

## Accessibility and interaction

- Use an `h1` for Invitations and `h2` headings for Received, Invite people,
  and Pending invitations sent.
- Associate pending counts with their headings in visible text; do not encode
  meaning only in the menu badge.
- Every input has a persistent visible label. Error text is associated with the
  relevant field or invitation card.
- Send results use a polite status region. Load/action failures use alerts
  without moving focus unexpectedly.
- Confirmation dialogs trap focus, close with Escape, lock background scroll,
  and restore focus to the invoking action.
- While one card action is pending, disable that card's conflicting actions but
  do not freeze unrelated received or sent cards.
- Keep 44px minimum action targets, visible focus rings, logical source order,
  200% zoom support, and reduced-motion behavior.
- At narrow widths, stack card actions without forcing email addresses or bowl
  names into unusably narrow columns.

## Implementation boundaries

| Existing surface | Intended change |
| --- | --- |
| `src/screens/InvitesPage.jsx` | Become the three-section Invitations hub with independent states and responsive layout. |
| `src/hooks/usePendingInvites.js` | Remain the shared received-invitation authority and badge source; preserve last good data on load errors. |
| New sent-invitations data/controller hook | Load owned bowls' unaccepted invites; own create, email-delivery reconciliation, copy metadata, and revoke. |
| Shared invitation form/components | Reuse the email parser, bowl ordering, status patterns, and confirmation dialog behavior without copying mutations across screens. |
| `src/screens/BowlSettings.jsx` | Retain the roster; replace outgoing invitation form/list with contextual hub links. |
| `src/components/TopNav.jsx` | Always render Invitations and show the badge only for received pending invitations. |
| `src/screens/MyBowlsScreen.jsx` | Remove its duplicate received-invitation rendering as the route becomes onboarding/recovery. |
| `src/components/CreateBowlModal.jsx` | Retain optional initial invitations and invalidate sent-invitation data after creation. |

The existing `bowl_invites` table and owner/invitee RLS policies can support the
first version. Before implementation, verify that one authoritative operation
can safely create a multi-address batch and return the resulting IDs/tokens for
email reconciliation. If current client-side row creation cannot distinguish a
partial or ambiguous batch outcome, add a narrow RPC rather than retrying blind.

Do not broaden table grants, let recipients enumerate other invitations, or
let a bowl member send/revoke invitations through the global surface.

## Verification

Cover at minimum:

- the Invitations menu item with zero, one, ten, and failed-to-load received
  invitations;
- badge counts only received pending invitations;
- accept success/failure and atomic bowl-context refresh;
- decline confirmation, cancellation, success, and failure;
- global sending with zero, one, and several owned bowls;
- Bowl Settings preselection and rejection of stale/foreign/member-only IDs;
- one and several email addresses, duplicates within a batch, invalid input,
  partial email delivery, ambiguous response, and retry behavior;
- sent invitations grouped by bowl with copy and revoke actions;
- an invitation accepted on another device while its owner views Pending sent;
- member versus owner permissions;
- a user with shared bowls but no owned bowls creating a bowl from the hub;
- removal of duplicate invite UI from My Bowls and Bowl Settings;
- independent loading/error states, foreground refresh, offline behavior, and
  account switching;
- phone stacking, desktop sticky send card, long names/emails, keyboard-only
  use, confirmation focus restoration, 200% zoom, and screen-reader labels; and
- direct acceptance links and create-bowl invitations remain unchanged.

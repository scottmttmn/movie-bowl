# Bowl Settings redesign

Status: implemented (`src/screens/BowlSettings.jsx`).

The companion to `user-settings-redesign.md` — same diagnosis, same shape, one
screen further in. Bowl Settings had six flat panels whose headings named
database concerns ("Bowl Name", "Draw Method", "Draw Access", "Members",
"Add Links") rather than the questions someone opens the screen to answer.

## What was wrong

- **A whole panel for one text field.** "Bowl Name" was a section unto itself,
  above everything, even though the name is the page's subject and was already
  printed in the header.
- **The header ran backwards.** Back and the save status sat left, the title
  right-aligned on the right — the mirror image of every other screen.
- **Two panels, one question.** "Draw Method" and "Draw Access" both answer
  *how does this bowl pick a movie, and who may pick it*, and were separated by
  nothing but a panel boundary.
- **Members buried its own roster.** The invite form, the freshly generated
  link, and pending invites all came before the actual list of who is in the
  bowl.
- **Add links said the same thing twice.** Each card printed "Default label:
  Dad" directly above an editable input holding "Dad".
- **Copy confirmed off-screen.** Four copy buttons all reported success through
  a page-level banner at the top, which is nowhere near the button you pressed
  once the add-links list is on screen.
- **Raw styling bypassed the tokens** — `bg-slate-800/60` boxes instead of
  `surface-card`, and buttons sized four different ways (`px-2 py-1`,
  `px-3 py-2`, `text-sm`, none).

## The shape now

Three sections, a header that reads back all three, and a footer for the way
out — the same structure as User Settings, sharing the same
`SettingsSectionNav` tiles.

| Section | Question it answers |
| --- | --- |
| Drawing | How does this bowl pick a movie, and who is allowed to? |
| People | Who is in the bowl, and how do I add someone? |
| Add links | Who can add movies without joining? |

- **The name is the heading.** Owners edit it in place in the hero (a real
  field, with the `<h1>` kept for assistive tech); the standalone panel is
  gone. A role pill next to the eyebrow says Owner or Member, which the screen
  never stated before.
- **Drawing holds both settings**, method first, access second, split by a
  rule. The method options became selectable cards that highlight the chosen
  one instead of five near-identical grey boxes.
- **People leads with the roster** — avatar initial, email, role — and puts
  "Invite someone" (form, generated link, pending invites) below it.
- **Add links carry a status chip** (Active / Exhausted / Revoked) instead of a
  bare word, and the duplicated label line is gone: the input's placeholder now
  carries the "Link Guest" fallback it describes.
- **`CopyButton`** replaces four inline copy handlers and says "Copied" on
  itself for two seconds. It still sets the page banner, so nothing that
  depended on that message changed.
- **Leaving and deleting moved to the bottom.** "Leave Bowl" used to interrupt
  the middle of the page for members.

## Owner-only state stays owner-only

The header tiles summarize the sections, so they had to inherit the same
visibility rules as the sections: a member sees the draw method but not the
"N can draw" allow-list count, and never the pending invite count. Only the
owner's tiles carry those.

## Deliberately unchanged

- Every handler, query, RPC, and the autosave contract. This is a markup
  change; the first ~690 lines of the file were not touched.
- Add links stay visible to members, Delete included. A member deleting
  someone else's link is refused by RLS and surfaces the error — a real
  dead-end, but a pre-existing one with a test pinning it, so closing it is
  its own change (logged in `TODO.md`).

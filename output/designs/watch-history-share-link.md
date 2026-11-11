# Watch History Share Link

Status: implemented, November 2026 (`supabase/migrations/20261110120000_add_watch_history_share_links.sql`).

## The idea

Someone wants to show a friend what they have been watching without Movie
Bowl becoming a social app. The answer is one private link per account that
opens a read-only copy of their Watch History calendar.

## What it is not

There are no profiles, follows, likes, replies, feeds or viewer counts, and
none should be added. Nobody is told when a link is opened, and a viewer
needs no account. The viewer can look, and nothing else.

## Decisions

- **One link per account.** It is live: it shows the history as it stands
  now, not as a snapshot. A snapshot sent through the share sheet and a
  bowl-members-only view were both considered and turned down. A snapshot
  goes stale immediately, and the people someone wants to show are usually
  not in their bowls.
- **Same calendar, fewer facts.** The viewer sees the owner's vertical
  month-and-day calendar (`WatchHistoryTimeline`, shared with Watch History
  itself): poster, title, year and the day watched. A grid of posters by
  month was mocked up first and rejected in favor of the calendar people
  already know.
- **Never shown:** which bowl a movie came from, the slip's reason (another
  person's words), entry ids, and whether an entry was a solo draw.
- **The owner's own comments** (`personal_note`) show only while "Show my
  comments" is on. The switch is off by default, and while it is off the
  database leaves the comments out of the response.
- **Turning it off deletes it.** The address then shows "This link is off".
  A later link gets a new token, so an old link never comes back to life.
  Turning off takes two taps, because a link someone was sent stops working
  for good.
- **Changing the comments setting keeps the token**, so a retry or a second
  tab never breaks a link that has already been sent.
- **The button tints rose while a link is live**, so a shared history never
  goes unnoticed.
- **Not indexed.** The page carries `noindex`, and the token is 32 hex
  characters.

## Shape

- `watch_history_share_links` is sealed: no API role can reach its rows. The
  owner manages their link through `get_my_watch_history_share_link`,
  `save_my_watch_history_share_link` and `delete_my_watch_history_share_link`.
  Anyone can call `get_shared_watch_history(token)`, which answers null for
  both an unknown token and a turned-off one, deliberately treating them the
  same.
- `/w/:token` (`SharedWatchHistoryPage`) renders without the top nav, like
  `/add-to-bowl/:token`. Feedback reports redact its token like the others.
- Deleting the account deletes the link (the foreign key to `auth.users`
  cascades).

Mockups: project files, `watched-share/mockup/` (v1) and `mockup/v2/`.

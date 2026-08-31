# Movie details

Status: implemented, August 2026.

Keep the detail view compact and give its actions a clear hierarchy, on both
phones and desktop. This is a presentation change; adding, pinning, editing
comments, returning watched movies, and provider-link permissions are unchanged.

- Pair a portrait poster with the title, year, runtime, and contributor. Avoid
  the oversized poster stage. Missing or failed posters use a dark placeholder.
- Use the shared My Movies poster pin icon, with one short explanation below
  the header. Preserve pending states, errors, and disabled reasons. Do not add
  a separate pin form or a Pinned badge.
- Put a prominent **Watch trailer** button beside the title. Load the player
  only when requested, at full content width below the header. Hide it when
  the movie changes.
- List streaming providers once under **Where to watch**, marking the user's
  saved services. Keep native secure new-tab launch links and Watchmode credit.
- Place comments below streaming information in a subdued note card, with a
  small Edit action. An empty editable comment has only **Add a comment**;
  opening the editor focuses it. Preserve plain text, line breaks, validation,
  save errors, and the option to clear a note.
- Keep Close outside the scrolling content. If an add/return action exists,
  keep it in the footer; do not duplicate Close at the bottom.

Validation includes shared component and screen tests, desktop/mobile browser
smoke tests for persisted pins and comments, and visual checks for normal,
long-title, long-comment, missing-poster, disabled-pin, and watched states.

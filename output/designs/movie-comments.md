# Movie Comments

Status: implemented.

## Product Idea

When someone adds a movie, they can optionally leave a short personal comment
explaining why they chose it. For example:

> Recommended by Tim at dinner.

The comment gives the eventual draw some memory and personality. Movies can sit
in a bowl long enough that even the person who added one no longer remembers
where it came from or what made it worth watching. Revealing the comment with
the movie restores that context without exposing more of the bowl beforehand.

Comments appear in movie details and draw reveals, with a short preview on
the add dialog's session list. Bowl cards and poster strips remain unchanged.

## Product Decisions

- A comment is optional. Adding a movie without one remains the normal path.
- Signed-in bowl adds stay one tap. Once a movie is saved, its row in
  **Added this session** offers a comment icon that opens an inline editor
  with Save and Cancel. There is no comment field before adding.
- Public add-link guests still attach a comment to the next movie through
  their form. Failed adds preserve that draft so the guest can retry.
- Signed-in members, public add-link guests, and people creating manual watch
  history entries can all leave comments.
- A signed-in contributor can edit the comment on one of their own undrawn
  movies from its session row or My Movies detail view.
- A public-link guest cannot edit a comment after submitting it because the
  guest has no durable identity or authenticated ownership of the slip.
- Once a movie is drawn, its shared comment is a historical snapshot. It is
  read-only in the draw reveal and the bowl's Watched details.
- Moving a watched movie back to the bowl preserves its original comment and
  makes it editable again only for its original signed-in contributor.
- Manual watch-history comments belong to the signed-in user and remain
  editable with the rest of that history entry.
- Existing movies and history entries have no comment and render exactly as
  they do today.

## Language and Limits

Use one nullable `note` value throughout the data model even though the UI copy
can reflect the context.

### Signed-in bowl add dialog

- Session list: **Added this session**, newest first, containing confirmed adds.
- Icon labels: **Add comment for [title]** / **Edit comment for [title]**.
- Editor label: **Comment for [title]**; actions: **Save comment** and **Cancel**.
- Saved comments show a short preview and a filled comment icon.
- Each row stays associated with the bowl it was added to, even after changing
  the destination. The adjacent trash button confirms removal from that bowl.
- Closing ends the session list; pending operations can be reattached on
  reopening. Saved movies and comments remain in the bowl.

### Public add-link form

- Label: **Comment (optional)**
- Placeholder: **Recommended by Tim at dinner…**
- Supporting copy: **Add a reminder of why this movie belongs in the bowl.**

### Manual watch-history form

- Label: **Comment (optional)**
- Placeholder: **What made this one memorable?**

### Detail and reveal display

- Bowl movie heading: **Why it’s in the bowl**
- Manual history heading: **Your comment**

Comments are multiline plain text with a 500-character maximum. Trim leading
and trailing whitespace before saving and store a blank result as `null`.
Preserve internal line breaks when displaying the comment. Never interpret the
value as HTML or Markdown.

## Intended Experience

### Adding a bowl movie

1. The user opens the existing Add Movie form.
2. They may type a comment before choosing a search result or custom title.
3. They use the same one-tap Add action as today.
4. The selected movie and current comment are saved together.
5. On success, search state and the comment reset. On failure, both stay in
   place for correction or retry.

The comment field belongs to the form, not to an individual search-result row.
Whichever result or custom title the user adds receives the current comment.
This keeps every existing add action one tap and gives custom titles the same
capability as TMDB titles.

The field starts collapsed behind a **Comment (optional)** row under the search
box. Expanded by default it pushed the first search result off a phone screen,
which made the search look broken rather than the comment look inviting. The
collapsed row shows the current draft, so a comment waiting to be attached is
never hidden, and the row sits outside the pinned search header so it scrolls
away with the results.

### Before the draw

The contributor can open one of their own slips under My Movies and see the
comment in the existing movie detail modal. An Edit Comment action exposes the
same limited multiline field and saves without changing any movie metadata.

Other undrawn-movie surfaces do not show comment text or a comment indicator.
This is consistent with the current UI hiding the bowl's contents before the
draw. Like the movie snapshots themselves, this is UI-level concealment rather
than a new database confidentiality boundary: bowl members already have select
access to the underlying `bowl_movies` rows.

### When the movie is drawn

The comment appears as part of the reveal in both places a draw can finish:

- the phone/web `AddMovieModal` detail reveal;
- the TV `TvRevealScreen`.

Place it near the contributor attribution and before trailers, providers, or
launch actions. The comment should feel like a short note from the person who
put the slip in the bowl, not like movie metadata.

### After the draw

The original comment appears read-only in:

- the bowl dashboard's Watched movie detail;
- the signed-in user's Watch List detail for a bowl draw;
- the TV reveal while the drawn movie remains on screen.

Poster strips, Watched cards, My Movies cards, and Watch List rows remain
unchanged. A missing or blank comment renders no heading or empty container.

### Manual watch history

The Add to Watch History and Edit Watch History forms include the optional
comment field. The comment appears only in that entry's detail view and can be
changed whenever the user edits the entry. Manual comments never affect bowl
movies with the same TMDB id.

## Data Model

Add nullable `text` columns named `note` to:

- `bowl_movies` — the current slip and editable pre-draw source;
- `bowl_draw_events` — the immutable shared draw snapshot;
- `user_watch_events` — the personal watch-history snapshot or manual note.

Add database checks limiting each non-null value to 500 characters. Client and
server validation should provide friendly errors, but the database constraint
is the final protection for direct or stale clients.

Create the schema and function changes in one timestamped migration. Existing
rows need no backfill; `null` is the correct historical value.

### Draw propagation

Both draw methods ultimately pass through `_record_bowl_movie_draw`. Update
that helper so one code path copies `bowl_movies.note` into both the new
`bowl_draw_events.note` and each participant's `user_watch_events.note`.
Replace the current helper definition in the migration rather than duplicating
logic in `draw_bowl_movie` and `draw_bowl_movie_by_rotation`.

Update `return_bowl_draw_to_bowl` so a returned slip copies the note from the
draw event back into the new `bowl_movies` row.

### Authenticated add and edit

`useBowl.handleAddMovie` should accept the comment as part of the movie object,
normalize it, include it in the optimistic row, and persist it in the insert.

Do not grant broad client update access to `bowl_movies`. Add a narrow
security-definer RPC such as `update_own_bowl_movie_note(p_bowl_movie_id,
p_note)` that:

- requires authentication;
- updates only a row whose `added_by = auth.uid()`;
- requires `drawn_at is null`;
- trims and validates the note;
- returns the updated row or a clear not-found/not-editable error.

Public-link rows have `added_by is null`, so the same rule naturally prevents
post-submit guest edits.

### Public add links

Keep the current `consume_bowl_add_link(text, jsonb, text)` signature. Include
the normalized note in the movie JSON payload, validate it in the API route and
RPC, and insert it with the other snapshot fields. Keeping the signature avoids
creating an ambiguous PostgREST function overload.

### Watch history

Extend `create_manual_watch_event` and `update_user_watch_event` to accept and
validate the optional note. Because PostgreSQL function identity includes input
arguments, the migration must deliberately remove or wrap superseded signatures
so PostgREST does not expose ambiguous overloads. Update every client call in
the same release. The update RPC must enforce the distinction at the database
boundary: it may change `note` for a manual entry, but must leave the copied
note unchanged for a bowl-draw entry even if a stale or modified client sends a
different value.

For a `source_kind = 'bowl_draw'` Watch List entry, the copied comment is the
personal durable snapshot of the original bowl comment. The shared
`bowl_draw_events.note` remains unchanged if a user later edits other personal
watch-history fields. The comment itself is read-only for bowl-draw entries;
only `source_kind = 'manual'` entries send an updated note through the history
editor.

## Client Changes

### `MovieSearch`

- Own the add-form comment draft so quick Add, detail Add, custom titles, and
  public add-link additions all share the same behavior.
- Attach the normalized draft to the detailed or custom movie passed to
  `onAddMovie`.
- Clear it in `resetAfterSuccessfulAdd`; preserve it on errors.
- Enforce the maximum with `maxLength` and show a small character count near
  the limit.

### `AddMovieModal`

- Render the read-only comment section when a detail movie has a non-empty
  note.
- Accept an edit action only for the My Movies context; do not infer edit
  permission inside the shared modal.
- Keep the add-form field inside `MovieSearch`, since `AddMovieModal` also
  serves draw and history details.

### `BowlDashboard` and `useBowl`

- Select `note` for remaining movies and draw events.
- Carry it through optimistic add state and the returned draw result.
- Add a focused note-update handler to `useBowl` and expose it to the dashboard.
- Enable editing only from My Movies for the current user's undrawn rows.
- Refresh or patch local state after a successful edit.

### `WatchHistoryEntryModal` and `WatchListPage`

- Select `note` with watch-history rows and preserve it during TMDB detail
  enrichment.
- Add the editable field for new and manual entries.
- Show the field read-only when editing a bowl-draw entry, because it represents
  another contributor's historical rationale.
- Pass the note to the create/update RPC only where editing is allowed.

### Public add links

- No separate UI is needed in `PublicAddLinkPage`; it already renders
  `MovieSearch`.
- Extend `consumeAddLink` and the server route's payload normalization so the
  same form field reaches `consume_bowl_add_link`.

### TV

- Select and retain the note through `useBowl` and drawn-movie enrichment.
- Add a styled, non-focusable comment block to `TvRevealScreen` below the movie
  facts/overview and before providers and actions.
- Preserve multiline wrapping and ensure long allowed comments do not push the
  primary actions off common TV viewports.

## Validation and Failure Behavior

- The client prevents input beyond 500 characters.
- API routes reject an over-limit public comment with a 400 response and a
  useful message.
- RPCs trim text, convert blank values to `null`, and reject over-limit values.
- Failed adds or edits keep the draft visible.
- A stale edit attempted after another user draws the movie returns a normal
  inline error and reloads the bowl; it must not alter the draw snapshot.
- Comment persistence never affects draw eligibility, contributor buckets,
  filtering, odds, duplicate detection, or streaming enrichment.

## Testing Plan

### Component and screen tests

- `MovieSearch`: optional field is available; quick TMDB, detail, and custom
  adds pass the comment; blank input becomes `null`; success clears it; failure
  preserves it; maximum length is enforced.
- `AddMovieModal`: comment renders in detail mode, preserves line breaks, and
  omits the entire section when blank.
- `WatchHistoryEntryModal`: manual create/edit supports comments; bowl-draw
  comments are visible but read-only.
- `BowlDashboard`: drawn, Watched, and My Movies details receive the comment;
  only the contributor's undrawn My Movies context offers editing.
- `WatchListPage`: selects and displays comments, passes manual comments to the
  RPCs, and does not overwrite a bowl-draw comment.
- `PublicAddLinkPage` and API tests: guest comments reach the RPC, blanks become
  null, and over-limit requests fail without consuming an add.
- TV tests: the reveal shows a comment when present and keeps the no-comment
  layout unchanged.

### Hook tests

- `useBowl` selects, optimistically inserts, persists, reloads, draws, and
  updates notes without disturbing existing movie fields.
- The note edit handler surfaces permission, already-drawn, validation, and
  unexpected failures through the existing result-object convention.

### Database tests

Add pgTAP coverage for:

- a member adding a note and editing their own undrawn note;
- another member being unable to edit it;
- the original contributor being unable to edit after the draw;
- public-link insertion with a note and no post-submit edit path;
- ordinary and rotation draws copying the note to shared and personal history;
- returning a draw preserving the note;
- manual history create/update with a note and cross-user denial;
- blank normalization and 500-character enforcement;
- existing null-note rows remaining readable and drawable.

## Migration and Rollback

Ship the nullable columns and all dependent function replacements together so
no draw path can create a partial history snapshot. Include a rollback outside
`supabase/migrations/` that restores the prior RPC/helper definitions before
dropping the three note columns and the note-edit RPC.

The deployment order is:

1. Apply the database migration, which remains compatible with the old client.
2. Deploy the client and public add-link API changes.
3. Run the full unit suite and production build, then manually smoke-test
   signed-in add, guest add, both draw methods, TV reveal, return to bowl, and
   manual watch history.

## Out of Scope

- threaded comments, replies, reactions, or multiple comments per movie;
- comment indicators or previews on cards and poster strips;
- comments from other bowl members before the movie is drawn;
- rich text, Markdown, links, mentions, or attachments;
- editing the shared historical comment after a draw;
- adding comments to existing undrawn guest slips whose link has already been
  consumed;
- exporting comments to Letterboxd CSV.

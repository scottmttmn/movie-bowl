# TV Watch History Details and Safe Return

Status: implemented in the repository; migration and release verification are
pending. Product direction settled August 31, 2026.

## Decision Summary

TV Watch History is a browsing surface, not a return queue. Selecting a history
card opens a full movie-detail view. Returning the movie to the bowl remains
available from that detail view as a secondary group-level undo action.

The return operation means **the group did not watch this pick**:

- restore the title to the bowl and make it eligible for a future draw;
- mark the bowl draw event as returned, so it leaves the active bowl Watch
  History strip while the immutable draw record remains in the database;
- when the return is committed within two hours of the draw, remove every
  personal history entry that draw created automatically; and
- when the return is committed after the two-hour undo window, leave every
  personal history entry unchanged.

Wanting to watch a movie again is a separate use case. The member adds the title
to the bowl through the normal Add Movie flow. Rewatching does not reverse the
old draw or alter anyone's history.

## Why This Needs More Than a Copy Change

The current TV row says "Select a title to return it to the bowl," gives every
card an accessible name beginning with "Move," and opens the return confirmation
as soon as a card is selected (`src/tv/screens/TvTonightScreen.jsx`). That makes
returning the apparent purpose of Watch History and prevents the row from being
useful for browsing posters, descriptions, comments, trailers, or providers.

The shared return RPC also deletes every `user_watch_events` row created by the
draw. That gives accidental and abandoned draws a useful all-participant undo,
but it has no time boundary: a draw-capable member can erase the group's
personal history days or months later. The intended ownership boundary is a
short, predictable group undo period followed by preservation. This is tracked
as MB-001 in `KNOWN_ISSUES.md`.

The schema already provides most of the required information:

- `bowl_draw_events` holds the durable group draw, its movie snapshot, and
  `returned_at` / `returned_by`;
- `user_watch_events` holds one private record per participant linked to its
  source draw event;
- the draw-event snapshot already includes title, poster, year, runtime,
  genres, overview, note, contributor, and draw date; and
- the existing TV reveal screen already has a viewing-distance layout for the
  poster, facts, overview, bowl note, current providers, trailer, and provider
  handoff.

The work is therefore a clearer state model plus a TV detail presentation, not
a new history system.

## Product Model

The implementation must keep these concepts separate:

| Concept | Meaning | User-facing effect |
| --- | --- | --- |
| Bowl draw event | The group picked a title | Appears in the current bowl's TV Watch History while not returned |
| Personal history during undo window | The draw was made no more than two hours before the server commits the return | Removed for every participant as part of the group undo |
| Personal history after undo window | More than two hours have elapsed since the draw | Preserved for every participant |
| Put back in bowl | The group did not watch the pick | Always restores the slip and returns the draw event; personal cleanup depends only on the undo window |
| Add Movie again | The group watched it and wants another future viewing | Adds a new slip without changing the earlier draw or history |

The TV strip continues to show active, unreturned draw events from the current
bowl. This project does not turn the TV into the signed-in user's complete
cross-bowl personal-history page.

## Goals

- Make viewing details the primary result of selecting a Watch History card.
- Give the TV detail view the same quality and information hierarchy as the
  post-draw reveal without changing the reveal's behavior.
- Keep "put back" available but secondary, permission-aware, confirmed, and
  honest about its group-wide effect.
- Give accidental and abandoned draws a simple two-hour group undo window.
- Preserve all personal history after that window instead of trying to infer
  whether an individual record should survive.
- Preserve D-pad, Back, focus, trailer, provider-launch, custom-entry, offline,
  and long-content behavior.
- Keep phone and TV return copy consistent with the shared server semantics.

## Non-Goals

- Editing personal Watch History from the TV.
- Adding movies from the TV.
- Adding a separate "watch again" or "re-add watched movie" command.
- Showing returned draw events in a new archive or activity timeline.
- Changing when a draw initially creates participant history records.
- Reworking the phone's existing movie-detail layout beyond the return label and
  confirmation copy needed for semantic consistency.
- Repairing personal history that an older version of the RPC already deleted;
  that data cannot be reconstructed safely without a backup.

## Vercel Hobby Constraint

The project already has twelve production API entrypoints, the Hobby limit for
direct Vercel Functions. `api/movie-cache.js` already combines provider-link
and filter-warm routes specifically to stay at that ceiling. This project must
add **zero** Vercel Function entrypoints.

The two-hour rule is a replacement definition for the existing Supabase
`return_bowl_draw_to_bowl` Postgres function. Calling it goes from the client to
Supabase and does not create or invoke a Vercel Function.

History detail enrichment reuses existing endpoints. On the first open of a
positive-TMDB history item, the worst case is three invocations of functions
that already exist:

1. TMDB movie details for the trailer and missing facts;
2. TMDB providers only when the bowl's persistent Supabase metadata cache misses;
3. the consolidated `movie-cache` provider-link action.

Render the stored draw snapshot before all of them, start no enrichment for a
custom entry, retain the existing provider and provider-link caches, and add
in-flight plus short session caching for repeated movie-detail requests. Do not
prefetch detail enrichment for the whole history strip. A failed or skipped
enhancement must leave the snapshot detail usable.

The deployment gate is explicit: inspect the preview build and prove it still
contains no more than the current twelve Vercel Functions. If later work needs a
new server action, consolidate it behind an existing dispatcher or remove an old
entrypoint in a separately reviewed change; this feature cannot consume a
thirteenth slot.

## TV Experience

### Watch History row

Keep the existing heading and bowl context. Change the instructional and
accessible copy:

- Heading: **Watch History**
- Helper: **Select a title to see details.**
- Card accessible name: **View details for {title}**

The poster strip remains compact. A card can show the title and, when available,
the release year; return language does not appear in the row. Selecting a card
must not mutate data or open a confirmation.

### History detail screen

Selecting a card opens a full-screen TV detail view. It should reuse the visual
language of the existing reveal screen while carrying history-specific context:

- header context: **Watch History** and the current bowl name;
- large poster, with the existing missing-poster fallback;
- title, release year, runtime, and up to three genres;
- **Picked {date}**, not "Watched," because a draw can be abandoned;
- contributor attribution when available;
- overview;
- a clearly labeled **Bowl note** containing the snapshotted movie comment;
- current streaming-provider matches and provider handoff;
- trailer action when TMDB supplies a YouTube trailer; and
- a visible **Close** action.

The stored draw-event snapshot is authoritative for the title, contributor,
note, and draw date. Current TMDB data fills absent metadata and supplies the
trailer; it must not overwrite the historical bowl note or identity. Current
provider data describes availability now, so it can be refreshed.

The detail should render immediately from the stored snapshot and enrich in the
background. A provider or TMDB failure removes only the unavailable enhancement;
it does not replace the whole detail screen with an error. Custom entries with
no positive TMDB id never start those requests and still receive a complete
snapshot-based detail view.

### Detail actions

**Close** is the initial focus and the ordinary way out. Remote Back has the same
effect. Provider and trailer actions retain their existing behavior.

**Put movie back in bowl** is visually separated from playback actions and uses
secondary styling. Show it only when the signed-in TV account can perform the
server operation (`bowlMeta.canDraw` under the current permission contract).
The server remains authoritative; hiding the button is not the permission
boundary.

Selecting the return action opens a confirmation over the detail screen:

- Title: **Put “{title}” back in bowl?**
- Explanation: **Use this if your group didn't watch it. The movie will be
  eligible to draw again. Personal history is removed only when a movie is put
  back within two hours of its draw.**
- Default, initially focused action: **Close**
- Confirming action: **Put movie back in bowl**
- Pending text: **Putting movie back…**

The client does not calculate the window, show a countdown, or claim which
outcome the server will choose near the boundary. The RPC compares its own
transaction timestamp and is the only authority on whether cleanup occurs.

Closing the confirmation returns to the unchanged detail screen. A failed return
keeps the confirmation open, announces the server error, and allows Close. A
successful return closes both detail and confirmation, reloads the bowl, and
announces **{title} is back in the bowl.** on the main TV screen.

### Focus and Back behavior

The focus stack, from most local to broadest, is:

1. trailer overlay;
2. return confirmation;
3. history detail;
4. main bowl screen; and
5. bowl picker.

Covered layers must remain `inert` as well as `aria-hidden`; the Android TV
WebView can otherwise move native focus into controls behind an overlay.

Closing a detail view restores focus to the card that opened it. After a
successful return that card no longer exists, so focus falls back to the Draw
button. If another client returns the selected event while its detail is open,
close the detail on the next bowl refresh, show a quiet status message, and use
the same fallback.

## Client Architecture

### Presentation components

Do not duplicate the large reveal markup wholesale. Extract the stable visual
content from `TvRevealScreen` into a presentational movie-detail body that owns:

- poster and fallback;
- title and facts;
- overview;
- bowl note;
- provider badges; and
- slots for context-specific actions and status.

Keep two thin screen wrappers:

- `TvRevealScreen` retains **Tonight's pick**, theater-mode state, external
  provider-return persistence, and the current post-draw Back behavior.
- `TvHistoryDetailScreen` supplies history context, picked date, Close, and the
  return entry point.

This keeps the draw path independently testable and prevents history-specific
actions from leaking onto the just-drawn reveal.

### State in `TvTonightScreen`

Add explicit state for:

- the selected raw history event;
- the enriched history-detail movie;
- detail enrichment status or non-blocking error;
- the history card id that should regain focus; and
- the existing pending return, return error, and return pending state.

Selection flow:

1. Record the selected draw-event id for focus restoration.
2. Render its stored snapshot immediately.
3. For a positive TMDB id, load details and current providers concurrently.
4. Ignore a late response if the user closed the detail or selected a different
   event.
5. Resolve provider links against whichever movie-detail screen is active while
   preserving the drawn-movie prefetch behavior.

The selected history event and a newly drawn reveal are mutually exclusive in
normal navigation. Render priority remains loading/error, drawing, drawn reveal,
history detail, then the main screen.

### Shared return handling

`handleReaddMovie` continues to accept the draw-event id and call the shared
RPC. Keep its capacity and active-TMDB duplicate checks. The UI must continue to
pass `drawEventId`, not an enriched TMDB id or the historical bowl-movie id.

The phone dashboard already opens movie details before offering a return. Align
its labels with the TV:

- **Move to Bowl** becomes **Put movie back in bowl**; and
- the confirmation explains the same two-hour history rule instead of saying
  the movie becomes "not watched for everyone."

No phone layout redesign is part of this project.

## Database Plan

### Two-hour cleanup in `return_bowl_draw_to_bowl`

Create a new timestamped migration that preserves the current transaction and
locking behavior, including authentication, `can_draw_from_bowl`, capacity,
active duplicate protection, movie snapshot restoration, and returned-event
metadata. No new history column is required.

Capture one server-side transaction timestamp and use it for both the returned
event and the cleanup decision. The boundary is inclusive: a return committed
exactly two hours after `drawn_at` is still an undo.

```sql
v_returned_at := now();

update public.bowl_draw_events
set returned_at = v_returned_at,
    returned_by = auth.uid()
where id = v_draw_event.id;

if v_returned_at <= v_draw_event.drawn_at + interval '2 hours' then
  delete from public.user_watch_events
  where source_draw_event_id = v_draw_event.id
    and source_kind = 'bowl_draw';
end if;
```

The caller does not submit an age or cleanup flag. The database compares its own
draw and return timestamps, preventing a modified client, a wrong TV clock, or a
timezone conversion from extending the undo window. `timestamptz + interval`
makes the rule elapsed-time based; daylight-saving and locale do not affect it.

After the transaction:

- one active bowl slip exists for the returned title;
- the source draw event has `returned_at` and `returned_by`;
- every generated participant history row is gone when the return committed no
  more than two hours after the draw;
- every participant history row is unchanged when the return committed more
  than two hours after the draw; and
- repeating the return fails without inserting another slip or deleting more
  history.

### Rollback and historical data

Add the repository-standard matching rollback. A rollback must not restore the
unbounded cross-user delete. Redefine return temporarily to preserve all
personal history. That is a safe degraded behavior while the time-window rule is
repaired, and it requires no schema rollback.

There is no automatic repair for history rows deleted before this migration.
Do not reconstruct personal dates or titles from the group draw snapshot. If a
backup is available, restoration is a separate audited operation.

## Test Plan

### pgTAP migration coverage

Add a dedicated migration test with an owner and at least one member:

1. Return a draw aged one hour and 59 minutes and prove every generated
   participant history row is deleted.
2. Edit one participant's row before that recent return and prove the time rule
   still deletes it; personal edits are deliberately not a second policy.
3. Return a draw aged two hours and one minute and prove every participant
   history row survives byte-for-byte, including an untouched row.
4. Test the exact two-hour boundary and prove it is included in cleanup.
5. Prove the bowl movie is restored exactly once with its original snapshot and
   bowl note in both the recent and older cases.
6. Prove each draw event records the same server timestamp used for its cleanup
   decision.
7. Prove a second return, outsider return, active duplicate, and full-bowl case
   retain their existing failures without partial cleanup.
8. Prove manual history is never affected by the draw return predicate.

Also update the existing comment migration's assumptions only where the latest
schema test needs to describe the new contract; do not rewrite historical
migrations.

### Client unit and component coverage

Extend `src/tv/__tests__/TvExperience.test.jsx` to prove:

- the helper and card accessible names are detail-oriented;
- selecting a history card opens details and does not call the return handler;
- poster, facts, picked date, overview, contributor, and bowl note render from
  the stored snapshot;
- trailer and provider data enrich a positive TMDB entry;
- a custom entry renders without a TMDB request;
- Close and Back return to the row without mutation and restore card focus;
- only permitted accounts see the return action;
- return opens a second confirmation whose default action is Close;
- the confirmation explains the two-hour rule without relying on the TV clock;
- closing confirmation stays on details;
- success passes the draw-event id, closes details, and announces completion;
- failure keeps context and exposes an alert;
- stale enrichment cannot replace a newly selected or closed detail; and
- trailer and confirmation overlays keep covered detail controls inert.

Keep the existing just-drawn reveal, theater-mode, provider-handoff, and Back
tests passing to guard the extracted shared presentation.

Update the phone dashboard guard tests for the new return label and two-hour
copy. Keep the hook tests proving the draw-event id, capacity guard,
duplicate guard, and post-return reload.

### End-to-end and fake backend coverage

Update `e2e/support/fakeBackend.js` so its return RPC compares the draw timestamp
with a server-side return timestamp. Extend the TV Playwright journey to:

- focus a Watch History card with the D-pad;
- open and close details without changing backend state;
- reopen, confirm return, and observe the movie in the bowl; and
- verify recent personal history is removed while older personal history is
  preserved.

Run the full Vitest and Playwright suites. Perform a physical Android TV smoke
check at 1080p for viewing-distance text, long titles, long notes, remote focus,
Back behavior, trailer exit, and the visual separation between Close and the
return action.

## Rollout Order

1. Land the migration, rollback, pgTAP coverage, frontend, fake backend, and
   documentation in one reviewed change set.
2. Apply the database migration before deploying copy that promises the
   two-hour rule.
3. Verify the deployed RPC with disposable recent and older draw events on
   opposite sides of the boundary.
4. Deploy the frontend and run phone, desktop, browser-TV, and Android TV smoke
   checks.
5. Update MB-001 to Fixed only after the migration is applied and the deployed
   behavior is verified.

The UI can be rolled back independently; the bounded server semantics should
remain. If the database change has to be rolled back, use the preserve-all
fallback described above rather than restoring unconditional deletion.

## Acceptance Criteria

- Watch History contains no copy suggesting that returning is the reason to
  select a card.
- Selecting a card is read-only and opens a polished, viewing-distance detail
  screen containing the stored bowl note when present.
- Close is the default detail and confirmation action; remote Back never mutates
  history.
- Return is secondary, permission-aware, confirmed, and passes the draw-event
  id.
- A return committed no more than two hours after its draw removes every
  autogenerated personal history entry for that draw.
- A return committed more than two hours after its draw preserves every
  personal history entry for that draw.
- A bounded undo disappears from TV Watch History. A draw returned after the
  window remains visible there with a `Back in bowl` status and no return
  action.
- Rewatching remains the ordinary Add Movie flow and does not reverse history.
- Custom entries and partial enrichment failures remain usable.
- Focus cannot enter controls behind the detail, trailer, or confirmation.
- Existing draw reveal and theater-mode behavior does not regress.
- The deployment still contains no more than twelve Vercel Functions and this
  project adds no new `api/` entrypoint.
- Reopening the same history detail in one session does not repeat an identical
  TMDB detail request while its cache is fresh.
- Database, component, hook, and end-to-end regression coverage passes.
- The migration is deployed before MB-001 is marked resolved.

## Expected Files

The exact split can change during implementation, but the work should remain
close to these boundaries:

- `src/tv/screens/TvTonightScreen.jsx`
- a new or extracted TV movie-detail presentation under `src/tv/components/`
- `src/tv/tv.css`
- `src/tv/__tests__/TvExperience.test.jsx`
- `src/screens/BowlDashboard.jsx`
- `src/screens/__tests__/BowlDashboard.guards.test.jsx`
- `src/hooks/useDrawProviderLinks.js` only if its name or active-movie contract
  is generalized; do not refactor it merely for naming aesthetics
- `src/lib/tmdbApi.js` for in-flight and short session detail caching; no new
  server endpoint
- a new `supabase/migrations/` migration
- a matching `supabase/rollback/` script
- a matching `supabase/tests/` pgTAP test
- `e2e/support/fakeBackend.js`
- `e2e/tv.e2e.js` or a focused TV history journey
- `KNOWN_ISSUES.md`, `TODO.md`, and any return-semantics README copy

## Implementation Record — August 31, 2026

The repository implementation follows the closed decisions above:

- `TvTonightScreen` now treats Watch History cards as read-only detail links,
  shares the reveal presentation for the polished detail page, loads TMDB and
  provider enrichment in the background, keeps stale responses from replacing
  a newer selection, defaults focus to Close, restores strip focus on exit, and
  places the confirmed return action after the viewing controls.
- `tmdbApi` deduplicates in-flight detail reads and keeps successful results in
  a ten-minute session cache. Provider reads continue through the existing
  cached provider path. No `api/` file or Vercel Function was added.
- `20260831200000_bound_return_history_cleanup.sql` captures one transaction
  timestamp and applies the inclusive two-hour cleanup rule. Its rollback
  preserves all personal history, and the matching pgTAP file covers recent,
  exact-boundary, older, edited, manual, unauthorized, duplicate, capacity, and
  repeated-return behavior.
- The phone confirmation, TV confirmation, and end-to-end fake backend now
  describe and emulate the same time rule.
- TV requests durable bowl history separately from the active-draw collection:
  bounded undos are omitted, while older returned draws remain browseable as
  `Back in bowl`. The phone bowl strip keeps its existing active-draw contract.
- Focused TV, TMDB-cache, and phone guard tests pass; ESLint and the production
  build pass. A local authenticated browser visual check still requires an
  active TV pairing, and physical Android TV verification remains a release
  step.

MB-001 stays open until the database migration has been deployed and verified.

## Decisions That Are Closed

- History-card selection opens details, not return confirmation.
- The non-mutating action is called Close, not Keep in history.
- Put back means an unwatched-pick undo; rewatch uses Add Movie.
- The group undo window is two elapsed hours, inclusive, measured on the server.
- Returns inside the window remove all generated participant history; returns
  after it preserve all participant history.
- TV Watch History keeps older returned draws visible and non-actionable;
  two-hour undos disappear from it.
- Personal edits do not create an exception to the time rule.
- The TV detail surface is read-only apart from provider/trailer launch and the
  secondary return action.
- The database migration precedes the frontend rollout.

No remaining product decision blocks implementation.

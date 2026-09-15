# Solo Draw

Status: plan, not implementation. Nothing here exists in code. Product review
settled the draw lifecycle: revealing a solo draw commits it to personal history,
with no acceptance or redraw controls on the result. Bowl copies remain available.
Optional removal lives in personal history. Solo undo is available there for two
hours; ordinary history deletion remains available afterward. Neither reverses a
separate bowl removal. The pool spans every bowl you belong to by default and can
be narrowed to a subset. Persistence work is listed under "Remaining Technical Design".

## Product Idea

Sometimes you are watching alone. You still want the bowl to decide for you, but
it should not spend the group's movie night. Solo draw picks from **only your own
titles**, and it does not care which bowl they are sitting in: by default it
pools your undrawn titles across every bowl you belong to, because on a night
alone the bowl boundary is the group's organizing idea, not yours. You can
narrow it — to one bowl, or to a few — when the context calls for it.

The draw itself is still a draw. The point is not to browse and pick; it is to
hand the choice to the bowl on a night when nobody else is in the room. And it
commits the choice when the movie is revealed, as the existing draw does. The
title lands in your watch list and the result stays focused on watching it.
Deciding whether you still want to suggest it to each group is a separate action
available from personal history.

## What It Writes, and What It Does Not

A solo draw is the group draw minus the group. The group's draw writes three
things in one transaction — it stamps `bowl_movies.drawn_at/drawn_by`, inserts
one immutable `bowl_draw_events` row, and inserts a `user_watch_events` row per
participant. A solo draw writes the last of those and skips the first two:

- **One `user_watch_events` row, yours.** RLS makes that table readable only by
  its owner, so the record exists and nobody else can see it.
- **No `bowl_draw_events` row.** The bowl's shared, immutable activity record is
  untouched, because the group did not draw anything.
- **No `drawn_at` stamp.** The title is not marked as drawn out from under the
  other members.

The reveal does not open a removal prompt. From the solo entry in personal
history, "Remove from my bowls…" opens the existing bowl-selection dialog.
Only that separate, explicit removal can change what another member sees.
It uses the same deletion of your own undrawn slips that the Watch List already
offers after a manual entry. The manual-entry flow keeps its immediate offer.

That shape is what keeps pooling honest. A draw that stamped `drawn_at` across
several bowls would make titles vanish from bowls whose members had no part in
the evening, with no event anywhere explaining it — a silent hole in a shared
object, multiplied by every bowl in the pool. Routing the removal through an
explicit offer means nothing leaves a bowl except by your deliberate choice, and
the reach of the feature stays exactly as wide as the reach of the thing that
already shipped.

It also settles most of what the earlier draft left open:

- **Does it require draw permission?** No. `can_draw_from_bowl` gates taking the
  group's turn, and no turn is taken. What the removal offer does touch is
  already governed: `bowl_movies_delete_owner_or_own_undrawn` permits deleting
  your own undrawn slips, which is precisely the set the offer acts on.
- **Is it reversible?** Solo undo is available from personal history for two
  hours after the draw commits, matching the group draw's undo window. It removes
  the solo history entry; there is no automatic bowl mutation to reverse.
  A separate "Remove from my bowls…" action is not part of undo: copies removed
  that way stay removed. Explain this when removing them. After two hours, the
  undo action expires, but ordinary history deletion remains available without a
  time limit. Do not call history deletion "undo" or "return to bowl".
- **What is the visibility rule?** Nothing new. The watch event is private by
  RLS; the removal is the same untraced shrink the Watch List offer already
  causes, which `TODO.md` already carries as an open complaint. If that is ever
  answered with an event the bowl can show, solo draw's removals should ride the
  same mechanism rather than growing a second one.
- **What does the bowl's draw method mean here?** Nothing, and now for two
  reasons. A solo pool has a single contributor, so person-first, title-first and
  rotation have no contributor choice to make. Pooled bowls may also disagree
  about their method. Solo selection instead follows the pin rule below and
  chooses uniformly among distinct eligible titles in the resulting pool.
  Within-person title weights remain a separate future idea.

## Reuse the Manual Entry Operations, With Different Timing

The manual entry operations exist and work cross-bowl, but their timing differs
from the agreed solo flow. `handleSaveEntry` in `src/screens/WatchListPage.jsx`
currently performs this sequence:

1. `create_manual_watch_event` with the full snapshot — `p_title`,
   `p_watched_on`, `p_tmdb_id`, `p_poster_path`, `p_release_date`, `p_runtime`,
   `p_genres`, `p_overview`, `p_note`. A selected `bowl_movies` row supplies the
   title snapshot; the watch date must be assigned at commitment rather than
   read from the undrawn row.
2. Reload the list.
3. `findOwnUndrawnBowlMovies(tmdbId)` — which queries `bowl_movies` for
   `added_by = <you>` and `drawn_at is null` with **no bowl filter at all**, then
   joins bowl names.
4. If there are matches, open `RemoveFromBowlsModal`, whose deletes run through
   `handleRemoveFromBowls` under the same two conditions.

`RemoveFromBowlsModal` is purely presentational — `title`, `matches`, `onKeep`,
`onRemove`, `isRemoving`, `errorMessage`, with each match a `{ id, bowlId,
bowlName }`. Reuse it from the solo history entry, not the reveal. Extract the
snapshot handling, lookup and removal operations into shared hooks/service
helpers; hooks own React state and data orchestration, and pure selection stays
in `utils/`. Keep saving and offering removal independently callable: manual
entry still saves then offers immediately, while solo draw saves at reveal and
looks up current bowl copies only when the history action is opened.

The history action must work after reload and on another device, including for
custom titles. A reveal's in-memory row id is not sufficient. The persistence
plan must retain the origin information needed for that later lookup, alongside
an identifiable solo record and its actual commit time. The existing manual
write is a reference for snapshot handling, not a settled persistence contract.
The earlier "no migration, no RPC" promise is withdrawn until this is designed.
Any new undo operation must enforce ownership and the two-hour limit on the
server, measured from commit time rather than an editable watched date.

The comment above `findOwnUndrawnBowlMovies` explains why the offer is scoped to
your own rows, and it applies here unchanged: RLS would let a bowl owner delete
anyone's slip, and silently dropping someone else's title would shift
person-first odds for the whole bowl with no visible cause.

### One improvement available only here

The manual path can only find slips by `tmdb_id`, and `createdTmdbId` is passed
through only when it is positive. Custom titles carry a **negative synthetic
`tmdb_id`**, so a manual entry for a custom title never gets a removal offer at
all — the slip stays in the bowl with nothing on screen to explain it.

A solo draw knows the exact `bowl_movies.id` it drew. Retain that identity for
the history action. On opening the removal offer, re-query that row under current
access, ownership and undrawn conditions, plus the `tmdb_id` lookup when the id
is positive, which picks up the same title sitting in your other bowls. Merge
matches by row id so the source copy is not offered twice. Custom titles then
get an offer covering the row that was actually drawn, if it is still eligible.

## The Cross-Bowl Pool Primitive

`guest-night.md` names the one thing neither feature has: resolving a single
eligible pool that spans more than one bowl, and says whichever feature ships
first should build it so the second inherits it. Under this plan solo draw ships
it, and it turns out to be small.

The read needs no RPC and no migration. `bowl_movies_select_members`
(`20260726153000_tighten_profile_and_bowl_movie_access.sql`) grants select on any
row whose bowl you own or belong to, so one client query returns your whole
cross-bowl pool:

```
from("bowl_movies").select(BOWL_MOVIE_FIELDS).eq("added_by", userId).is("drawn_at", null)
```

`BOWL_MOVIE_FIELDS` already carries `bowl_id`, `runtime`, `genres`, `is_pinned`
and the snapshot columns — everything the local filters, the selection, the
result card and the `create_manual_watch_event` call need. Bowl names come from
the same follow-up `bowls` select the Watch List already does. Titles added
through a public link carry `added_by_name` with a null `added_by`, so they are
excluded by the same predicate that scopes the pool to you.

Keep the selection itself in `utils/` and pure, per the layer rules: it takes the
rows and the injected fetchers, exactly as `getResolvedDrawPool` does today, with
an injected `randomFn` for determinism. The hook holds the Supabase read, the
watch-event write, and the removal offer.

## Filters, and What They Cost

Your own account draw settings apply — rating, genre, runtime, streaming
priority — because they are already the answer to "what am I willing to watch
tonight," and they need no new plumbing. `getResolvedDrawPool` applies rating,
genre and runtime in that order and then streaming priority, and it is
indifferent to which bowl a row came from.

Cost is the part pooling changes. Genre and runtime live on `bowl_movies`, so
they filter locally and free. Rating and providers need per-title lookups, and
the pooled set is larger than any single bowl's — plausibly several times larger
for someone in four or five bowls. The existing readouts already have the shape
of an answer: `useMyMovieEligibility` resolves lookups automatically up to
`AUTO_MY_MOVIE_ELIGIBILITY_LIMIT` (100 titles) and otherwise falls back to a
`manual` status with a "Check filter matches" affordance the person taps. Reuse
that threshold and that affordance rather than inventing a second rule. A
narrowed scope is also the natural escape: fewer bowls is fewer lookups, which
gives the bowl selector a second job beyond taste.

`resolveMyMovieEligibility` itself is not directly reusable, and it is worth
being clear about why. It answers a different question — *are my titles in the
bowl's pool*, which requires scanning other people's titles because streaming
priority is global to the bowl. A solo pool has no other people in it, so the
`scanOtherMoviesForBetterMatch` half of that module has nothing to scan and the
ranking collapses to "best rank among my own." The pieces underneath it —
`getLocallyFilteredCandidates`, `getDrawCandidates`, `isRatingFilterExhaustive`,
`createFilterMetadataFetchers`, the concurrency-bounded provider resolution —
are the reusable parts.

## Scope and Narrowing

Default is every bowl you belong to. The entry point decides whether that
default is overridden before the person sees anything:

- From the personal surface (the Watch List, or wherever the nav puts it), the
  scope starts as all bowls.
- From a bowl's own dashboard, the scope starts as that bowl, because arriving
  from inside a bowl is a statement about context. It is a starting point, not a
  lock — the selector is right there and "all bowls" is one tap away.

The selector itself is a multi-select of your bowls with a count of your undrawn
titles beside each, so the trade between breadth and lookup cost is visible while
you make it. For the initial release, keep scope changes only while the solo
screen is mounted. Opening a new solo session uses the entry-point default;
there is no saved scope preference. Always display the active scope.

### Empty States

Disable drawing when there are no eligible titles and explain why:

- No bowls selected: "Choose at least one bowl."
- No own undrawn titles across accessible bowls: "You have no movies to draw.
  Add a movie to a bowl to get started."
- Selected bowls have no own undrawn titles: "You have no movies in these bowls.
  Choose another bowl or add a movie."
- Filters exclude the pool: reuse the existing filter-specific explanation and
  offer access to the filters.

A failed read is an error with Retry, not an empty pool. Large pools retain the
manual lookup affordance and loading feedback described above.

## Duplicate Titles

Each TMDB movie gets one chance in the final solo selection, however many bowls
hold it. Group eligible rows by positive integer `tmdb_id` after scope and
filters have been applied, then apply pin priority and choose uniformly among
the remaining groups.
Custom titles remain separate by bowl-movie row id. Do not match by normalized
title: that could combine different films and requires ambiguous matching rules.

Choose a stable representative from each group (lowest row id) for its snapshot
and source-row identity. Keep that row's fields together, including its note;
do not merge notes or metadata from different copies. This is selection-only:
no rows are combined or changed in the bowls. The later removal action still
looks up all currently eligible own copies, independently of selection scope.
Per-bowl scope counts remain counts of slips in that bowl, not unique titles
across the entire pool.

## Pins

Apply the selected bowl scope and all draw filters, including streaming priority,
before considering pins. A distinct title is pinned for solo selection when any
of its eligible copies is pinned. If any eligible titles are pinned, choose
uniformly among those titles; otherwise choose uniformly among all eligible
titles. Pinning a TMDB movie in several bowls does not multiply its chances.
Pins outside the selected scope or on copies excluded by filters have no effect.

Drawing solo leaves bowl copies and their pins intact. Separately removing a
copy removes that copy's pin with it. Explain the rule as: "Your pinned movies
go first when they match your filters."

Repeat picks are intentional for the initial release. Because copies and pins
remain, a subsequent solo draw can select the same movie again. With one
eligible pinned title it will select that title again. Do not automatically
clear pins or exclude recently watched titles; those would be separate product
changes.

## Remaining Technical Design

The product decisions above are settled. Resolve the persistence contract before
implementation.

- **How is a solo draw persisted?** Commit at reveal and the two-hour undo are
  settled. Specify how to distinguish a solo entry from a manual entry, retain
  its commit time and source-row identity, and enforce undo ownership and expiry.
  Decide whether this uses a new `source_kind` or other explicit metadata; do not
  write indistinguishable manual rows and expect to recover their origin later.
  Include retry handling so an uncertain save cannot create duplicate entries.
  Review existing source-kind branches, including note editing, display and
  export. The schema/RPC details need design before implementation.
## Build Plan

1. **Settle persistence.** Specify solo identity, commit time, durable source
   information, retry handling and the server-enforced undo path.
2. **Ship a complete pooled solo flow.** Reuse the filtered-pool logic with an
   injected `randomFn`, and put cross-bowl reads and state in a hook. Add scope
   selection and the draw action. Persist successfully before presenting the
   committed result; show a recoverable error if saving fails. The reveal has
   no acceptance, redraw, undo or removal controls. Personal history supplies
   the two-hour undo, ordinary deletion, and optional removal action. Preserve
   the manual entry's immediate removal offer. Include distinct empty states,
   loading/error states, scope counts and the existing large-pool manual lookup
   affordance in this first release, rather than deferring them as polish.
3. **Later, optional enhancements.** Consider an opt-in setting, "Offer to remove
   movies from my bowls after a solo draw," which opens the removal prompt after
   the committed reveal. Default remains off. This setting never adds acceptance
   or free redraws and does not change undo semantics. Within-person title
   weights remain a separate later decision.

Guest night can reuse the pure pool/filter logic. Its cross-user data access
still needs its own authorization and server-side resolution as described in
`guest-night.md`; the solo client query does not provide that capability.

### Acceptance criteria

- Revealing commits exactly one private solo history entry and changes no bowl.
- Eligible copies of the same positive TMDB id have one combined chance; custom
  rows remain distinct even when their titles match. Scope and filters apply
  before grouping, and the chosen representative is stable.
- Eligible pinned titles take priority after all filters; multiple pinned
  titles have equal chances, duplicate pins add no weight, and solo draws do
  not clear pins. Repeated picks, including the sole eligible pinned title,
  remain possible without an automatic recently-watched exclusion.
- Opening a new solo session uses its entry-point scope; scope changes are not
  saved across sessions.
- Closing the result does not undo the draw; the result has no acceptance or
  redraw controls and does not open the removal prompt by default.
- Personal history offers solo undo through two hours after commit. The server
  rejects later undo; ordinary history deletion remains available afterward.
- A separate removal affects only selected, currently accessible, own undrawn
  copies. Undo or deletion of the watch entry never restores those copies, and
  the removal dialog explains that consequence.
- Removal lookup works after reload, including the source row for custom titles,
  and safely handles copies that have since been drawn, removed or lost access.
- Empty scopes, fully filtered pools, failed reads/writes and large lookup sets
  have usable states in the initial release.
- Existing manual entry and group draw flows retain their behavior.

Because the implementation touches the Watch List's save path and
`MovieSearch`-adjacent snapshot handling, it wants matching tests on the
extracted module rather than only on the new screen — shared code gains behavior only with tests that cover
both callers, and the manual entry flow is one of the flows that must keep
working.

## The Version This Replaces

Kept because the analysis is still true if the decision is ever revisited.

A solo draw that *removed the title itself* — stamping `bowl_movies.drawn_at`
rather than offering — would need a `draw_solo_movie(p_bowl_movie_id)` RPC
alongside `draw_bowl_movie`, doing the group draw's transaction minus the
`bowl_draw_events` insert, with a new `source_kind` added to that column's check
constraint. The schema fits it without a new table, which is exactly what
`20260724123000_add_durable_watch_history.sql` bought by splitting bowl activity
from personal activity. It would also need a visibility answer, a reversibility
path (no draw event means undo needs its own marker on `bowl_movies`), a
per-candidate permission check, and — pooled — a story for titles disappearing
from bowls that were not part of the evening.

Keeping copies in the bowls leaves withdrawal as a deliberate later choice.
It avoids automatic shared-pool mutations, but the committed solo record and its
bounded undo still require their own persistence design.

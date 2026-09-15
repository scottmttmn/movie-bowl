# Solo Draw

Status: plan, not implementation. Nothing here exists in code. Two things are
settled: the pool spans **every bowl you belong to by default**, narrowable to a
subset, and the draw **ends in your watch list** — it records the watch and then
offers to pull the title out of the bowls holding it, exactly as a manual Watch
List entry does today. What remains open is listed under "Still Open" and should
be answered before the build starts.

## Product Idea

Sometimes you are watching alone. You still want the bowl to decide for you, but
it should not spend the group's movie night. Solo draw picks from **only your own
titles**, and it does not care which bowl they are sitting in: by default it
pools your undrawn titles across every bowl you belong to, because on a night
alone the bowl boundary is the group's organizing idea, not yours. You can
narrow it — to one bowl, or to a few — when the context calls for it.

The draw itself is still a draw. The point is not to browse and pick; it is to
hand the choice to the bowl on a night when nobody else is in the room. And it
finishes the way watching alone already finishes in this app: the title lands in
your watch list, and you are offered the chance to take it out of the bowls that
are still holding it.

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

Then it offers the removal, and *that* is the only thing that can change what
another member sees. It is an offer, not a consequence — the same offer, doing
the same hard delete of your own undrawn slips, that the Watch List already
makes after a manual entry.

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
- **Is it reversible?** Yes, and the undo already exists.
  `delete_user_watch_event` removes the history row, and the Watch List already
  wires it up with no time limit — unlike the group draw's two-hour return
  window, which is short because it also puts a title back in a shared pool.
  One asymmetry to state plainly: deleting the history row does not undo a
  removal you accepted. Those are two decisions and only the second one reached
  a bowl.
- **What is the visibility rule?** Nothing new. The watch event is private by
  RLS; the removal is the same untraced shrink the Watch List offer already
  causes, which `TODO.md` already carries as an open complaint. If that is ever
  answered with an event the bowl can show, solo draw's removals should ride the
  same mechanism rather than growing a second one.
- **What does the bowl's draw method mean here?** Nothing, and now for two
  reasons. A solo pool has a single contributor, so person-first, title-first and
  rotation all collapse to a uniform pick. Pooled, the bowls in scope may also
  disagree about their method, and there is no sensible way to reconcile three
  owners' choices into one pick. The setting that would still matter is
  within-person title weights, recorded in `bowl-draw-methods.md`; solo draw and
  those weights are the same selection step.

## The Ending Already Shipped

The whole sequence after the pick exists, works cross-bowl, and is reusable
almost as-is. `handleSaveEntry` in `src/screens/WatchListPage.jsx` does exactly
what a solo draw needs to do, in this order:

1. `create_manual_watch_event` with the full snapshot — `p_title`,
   `p_watched_on`, `p_tmdb_id`, `p_poster_path`, `p_release_date`, `p_runtime`,
   `p_genres`, `p_overview`, `p_note`. A drawn `bowl_movies` row carries every
   one of those fields already, so a solo draw fills the call from the row it
   drew rather than from a form.
2. Reload the list.
3. `findOwnUndrawnBowlMovies(tmdbId)` — which queries `bowl_movies` for
   `added_by = <you>` and `drawn_at is null` with **no bowl filter at all**, then
   joins bowl names.
4. If there are matches, open `RemoveFromBowlsModal`, whose deletes run through
   `handleRemoveFromBowls` under the same two conditions.

`RemoveFromBowlsModal` is purely presentational — `title`, `matches`, `onKeep`,
`onRemove`, `isRemoving`, `errorMessage`, with each match a `{ id, bowlId,
bowlName }` — so it drops into a draw result screen untouched. Steps 1, 3 and 4
are the reusable seam; they should be lifted out of the screen into a shared
hook or `lib/` module, since they are Supabase writes and state rather than pure
logic, and the layer rules put those out of `utils/`.

The comment above `findOwnUndrawnBowlMovies` explains why the offer is scoped to
your own rows, and it applies here unchanged: RLS would let a bowl owner delete
anyone's slip, and silently dropping someone else's title would shift
person-first odds for the whole bowl with no visible cause.

### One improvement available only here

The manual path can only find slips by `tmdb_id`, and `createdTmdbId` is passed
through only when it is positive. Custom titles carry a **negative synthetic
`tmdb_id`**, so a manual entry for a custom title never gets a removal offer at
all — the slip stays in the bowl with nothing on screen to explain it.

A solo draw does not have that limitation, because it knows the exact
`bowl_movies.id` it drew. So the offer should be assembled from both: the drawn
row by id, plus the `tmdb_id` lookup when the id is positive, which picks up the
same title sitting in your other bowls. Custom titles then get an offer covering
the row that was actually drawn, which is more than the Watch List can manage
today and closes the gap for this path.

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
you make it. Whether the last selection is remembered, and where, is open below.

## Still Open

These are genuinely open and want answers before code.

- **When does the watch get written?** This is now the central question, because
  the draw is no longer inert. Writing at reveal is the most literal reading of
  "the draw adds it to your watch list," and it matches the group draw, which
  also writes `user_watch_events` the moment it draws. But it makes drawing again
  cost something: every rejected pick leaves a watch you did not watch and have
  to go delete. **Leaning: the reveal writes nothing, and the result card carries
  the commitment** — one control that records the watch and opens the removal
  offer, beside a "draw again" that stays free. That keeps the write true at the
  moment it happens and still delivers the whole flow in one tap. The group draw
  can afford the other answer because spending the turn is the point, and because
  returning within two hours deletes the history rows it generated; a solo draw
  has no equivalent pressure to commit. Worth deciding deliberately rather than
  inheriting.
- **Does it need its own `source_kind`?** `user_watch_events.source_kind` checks
  against `('bowl_draw', 'manual')`. Writing through `create_manual_watch_event`
  means `'manual'`, which needs no migration and, usefully, leaves the entry note
  editable — note editing is gated on `source_kind === "manual"` in both the
  screen and `update_user_watch_event`. The cost is that the watch list cannot
  tell you the bowl chose it. A `'solo_draw'` value would need a migration
  altering the check constraint plus a pass over everything that branches on that
  column, to buy a label with no behavior attached. Leaning toward `'manual'`,
  with one honest consequence recorded: rows written as `'manual'` stay
  indistinguishable forever if a `'solo_draw'` value is ever added later.
- **Duplicates across bowls.** The same film in three bowls is three
  `bowl_movies` rows, and an undeduped pooled draw would weight it three times.
  Deduping by `tmdb_id` handles every TMDB title; custom titles carry per-row
  negative synthetic ids that cannot be matched across bowls, and normalized-title
  matching is the only fallback available. Note this is a *selection* question
  only — the removal offer handles siblings correctly either way, because it
  looks the title up across bowls rather than acting on the drawn row alone.
- **Pins.** `bowl_movies_one_pin_per_contributor` allows one pin per contributor
  *per bowl*, so a pooled scope can contain several of your pins. A pin is a
  promise about your next turn in that bowl, which a solo draw does not consume,
  so the honest reading is that pins carry no selection authority here — but a
  pooled draw that quietly ignored several pins would still surprise someone who
  set them. Leaning: ignore pins in selection and say so once in the surface's own
  copy. Needs a decision, not a lean.
- **Remembering the scope.** A remembered selection is convenient and also the
  kind of state that narrows a draw with nothing on screen explaining it — the
  failure mode `deviceDrawSettings.js` calls out for device overrides. If it is
  remembered, it belongs in device storage wrapped in try/catch and it must be
  shown, not merely applied.
- **The empty state.** Pooled, "you have no undrawn titles anywhere" is a real
  and fairly bleak state, and it is reached differently from "your filters
  excluded everything" and from "you narrowed to one bowl and it is empty." Each
  wants its own sentence, in the style the draw already uses when a filter empties
  the pool.

## Build Plan

Three steps. The first is the whole feature; the others are polish that should
wait for the first to be lived with.

1. **Solo draw, pooled.** Lift the watch-event write and the removal offer out of
   `WatchListPage` into a shared hook or `lib/` module, taking a title snapshot
   plus the bowl-movie ids to offer, so both surfaces call the same path. Add a
   pure `utils/` selector over the filtered cross-bowl pool with an injected
   `randomFn`. Add a hook holding the single `bowl_movies` read, the bowl-name
   join and the scope selection. Add a screen: scope selector, draw action,
   result card, the commitment control, then the existing
   `RemoveFromBowlsModal`. No migration, no RPC, no new table, no change to any
   bowl's draw behavior.
2. **Cost and readout polish.** The manual "check filter matches" path, the
   per-bowl undrawn counts in the selector, and the empty states above.
3. **Only then**, decide whether within-person title weights belong here — see
   `bowl-draw-methods.md`. Solo draw and those weights are the same selection
   step, and building weights first would have meant building them blind.

Guest night inherits the pool primitive from step 1 and should not rebuild it.

Because step 1 touches the Watch List's save path and `MovieSearch`-adjacent
snapshot handling, it wants matching tests on the extracted module rather than
only on the new screen — shared code gains behavior only with tests that cover
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

The offer-based ending gets the same outcome for the person doing it, needs none
of that, and leaves the choice with them.

# Solo Draw

Status: plan, not implementation. Nothing here exists in code. The scope
question is now settled — the pool spans **every bowl you belong to by
default**, narrowable to a subset — and that decision settles most of what used
to be open, including whether this writes to the bowl at all. What remains open
is listed under "Still Open" and should be answered before the build starts.

## Product Idea

Sometimes you are watching alone. You still want the bowl to decide for you, but
it should not spend the group's movie night. Solo draw picks from **only your own
titles**, and it does not care which bowl they are sitting in: by default it
pools your undrawn titles across every bowl you belong to, because on a night
alone the bowl boundary is the group's organizing idea, not yours. You can
narrow it — to one bowl, or to a few — when the context calls for it.

The draw itself is still a draw. The point is not to browse and pick; it is to
hand the choice to the bowl on a night when nobody else is in the room.

## The Scope Decision, and What It Settles

The earlier version of this document treated a single bowl as phase one and
cross-bowl pooling as a larger second phase. That ordering is now reversed:
pooling is the default and the per-bowl case is the narrowed version of it.

This is not a cosmetic reordering, because it resolves the feature's central
conflict. That conflict was this: "removed from the bowl" and "invisible to the
other members" cannot both be fully true. Stamping `bowl_movies.drawn_at` with
no corresponding `bowl_draw_events` row makes a title vanish from every member's
remaining list with no trace anywhere they can see it — a silent hole in a
shared object, which someone will eventually ask about and the app will have no
answer for. The options were silent removal, a visible-but-anonymous withdrawal,
a named non-draw event, or no removal at all.

Pooling across bowls makes the first three markedly worse and the fourth
markedly better. A pooled pick draws from bowls the person was not even looking
at, so a withdrawal event would fire into a bowl whose members had no part in
the evening, about a title they will now see a hole where. Multiply that by
every bowl in the pool and the accounting the withdrawal was supposed to
preserve becomes noise. Meanwhile the option that removes nothing does not care
how many bowls the pool spans — nothing is written, so there is nothing to
explain to anybody.

**So this ships as a solo pick, not a solo draw.** It selects from your own
undrawn titles across the bowls in scope, shows you one, and stops. It writes
nothing to any bowl.

That single decision answers four of the five questions the earlier draft left
open:

- **Does it require draw permission?** No. `can_draw_from_bowl` gates taking the
  group's turn. Nothing is taken, so nothing is gated. This matters more under
  pooling than it would have under one bowl, because a pooled draw would
  otherwise have to check permission per candidate and silently drop titles from
  bowls where you cannot draw — an invisible narrowing with no way to explain it
  on screen.
- **Is it reversible?** There is nothing to reverse. `bowl_draw_events.returned_at`
  and the two-hour undo exist to unwind a group draw; a pick that changed no
  state needs no undo. Picking again is the undo.
- **What is the visibility rule?** There is nothing to make visible. No member's
  view changes.
- **What does the bowl's draw method mean here?** Nothing, and now for two
  reasons rather than one. A solo pool has a single contributor, so person-first,
  title-first and rotation all collapse to a uniform pick. Pooled, the bowls in
  scope may also disagree about their method, and there is no sensible way to
  reconcile three owners' choices into one pick — which is a second, independent
  argument for the collapse. The setting that would still matter is within-person
  title weights, recorded in `bowl-draw-methods.md`; solo pick and those weights
  are the same selection step.

The fifth question — which filters apply — is answered under "Filters" below.

## Why the Aftermath Already Shipped

Everything after the pick already works, and works cross-bowl, which is the
other half of why this version is cheap.

Logging a manual watch on the Watch List finds your own undrawn slips of that
title and offers to pull them out of whichever bowls hold them.
`findOwnUndrawnBowlMovies` in `src/screens/WatchListPage.jsx` already queries
`bowl_movies` filtered to `added_by = <you>` and `drawn_at is null` with **no
bowl filter at all**, joins the bowl names, and `handleRemoveFromBowls` deletes
the chosen ids under the same two conditions. It is an offer, not automatic, and
the comment above it explains why it is scoped to your own rows: RLS would let a
bowl owner delete anyone's slip, and silently dropping someone else's title
would shift person-first odds for the whole bowl with no visible cause.

`create_manual_watch_event` accepts the whole snapshot — `p_title`,
`p_watched_on`, `p_tmdb_id`, `p_poster_path`, `p_release_date`, `p_runtime`,
`p_genres`, `p_overview`, `p_note` — so a solo pick hands its chosen title
straight to that call with the fields prefilled.

So recording the watch is done, and removing the title when you want it removed
is done, and both already span bowls. What solo pick adds on top is the
*picking*.

## The Cross-Bowl Pool Primitive

`guest-night.md` names the one thing neither feature has: resolving a single
eligible pool that spans more than one bowl, and says whichever feature ships
first should build it so the second inherits it. Under this plan solo pick ships
it, and it turns out to be small.

The read needs no RPC and no migration. `bowl_movies_select_members`
(`20260726153000_tighten_profile_and_bowl_movie_access.sql`) grants select on any
row whose bowl you own or belong to, so one client query returns your whole
cross-bowl pool:

```
from("bowl_movies").select(BOWL_MOVIE_FIELDS).eq("added_by", userId).is("drawn_at", null)
```

`BOWL_MOVIE_FIELDS` already carries `bowl_id`, `runtime`, `genres`, `is_pinned`
and the snapshot columns, which is everything the local filters and the result
card need. Bowl names come from the same follow-up `bowls` select the Watch List
already does. Titles added through a public link carry `added_by_name` with a
null `added_by`, so they are excluded by the same predicate that scopes the
pool to you — a link guest's titles are not yours and never enter it.

Keep the resolver in `utils/` and pure, per the layer rules: it takes the rows
and the injected fetchers, exactly as `getResolvedDrawPool` and
`resolveMyMovieEligibility` do today. The hook holds the Supabase read.

## Filters, and What They Cost

Your own account draw settings apply — rating, genre, runtime, streaming
priority — because they are already the answer to "what am I willing to watch
tonight," and they need no new plumbing. `getResolvedDrawPool` applies rating,
genre and runtime in that order and then streaming priority, and it is
indifferent to which bowl a row came from.

Cost is the part pooling changes. Genre and runtime live on `bowl_movies`, so
they filter locally and free. Rating and providers need per-title lookups, and
the pooled set is larger than any single bowl's — plausibly several times
larger for someone in four or five bowls. The existing readouts already have the
shape of an answer: `useMyMovieEligibility` resolves lookups automatically up to
`AUTO_MY_MOVIE_ELIGIBILITY_LIMIT` (100 titles) and otherwise falls back to a
`manual` status with a "Check filter matches" affordance the person taps.
Reuse that threshold and that affordance rather than inventing a second rule.
A narrowed scope is also the natural escape: fewer bowls is fewer lookups, which
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

- **Duplicates across bowls.** The same film in three bowls is three
  `bowl_movies` rows, and an undeduped pooled pick would weight it three times.
  Deduping by `tmdb_id` handles every TMDB title. It does not handle custom
  titles: those carry a **negative synthetic `tmdb_id`** minted per row, so the
  same custom film in two bowls has two unrelated negative ids and nothing links
  them. Matching on normalized title is the only available fallback and it will
  occasionally be wrong. The open question is whether to dedupe custom titles at
  all, or accept the extra weight and say so. Whichever wins, the result card
  needs to name every bowl the winning title sits in, because the removal offer
  afterwards acts on all of them.
- **Pins.** `bowl_movies_one_pin_per_contributor` allows one pin per contributor
  *per bowl*, so a pooled scope can contain several of your pins. A pin is a
  promise about your next turn in that bowl, which a solo pick does not consume,
  so the honest reading is that pins carry no selection authority here — but a
  pooled pick that quietly ignored several pins would still surprise someone who
  set them. Leaning: ignore pins in selection, say so once in the surface's own
  copy, and do not sort them to the front of any list as though they meant
  something. Needs a decision, not a lean.
- **Remembering the scope.** A remembered selection is convenient and also the
  kind of state that narrows a draw with nothing on screen explaining it — the
  failure mode `deviceDrawSettings.js` calls out for device overrides. If it is
  remembered, it belongs in device storage wrapped in try/catch and it must be
  shown, not merely applied.
- **The empty state.** Pooled, "you have no undrawn titles anywhere" is a real
  and fairly bleak state, and it is reached differently from "your filters
  excluded everything" and from "you narrowed to one bowl and it is empty." Each
  wants its own sentence, in the style the draw already uses when a filter
  empties the pool.
- **Whether the bowl should ever learn.** This plan writes nothing, which is what
  makes it cheap and private. `TODO.md` already carries the mirror complaint
  about the shipped removal offer: watched-outside-the-bowl removals leave no
  trace, so other members just see the bowl shrink. If that is ever answered with
  an event the bowl can show, solo pick's removals should ride the same
  mechanism rather than growing a second one.
- **Is it what you actually want?** The honest question, unchanged from the first
  draft: on a night alone, is "the bowl chose it" what you want, or would you
  just pick something? A prototype answers this faster than an argument does, and
  the version below is small enough to be that prototype.

## Build Plan

Three steps. The first is the whole feature; the others are polish that should
wait for the first to be lived with.

1. **Solo pick, pooled.** A `utils/` resolver taking the cross-bowl rows plus
   injected fetchers and returning a uniform pick over the filtered pool, with an
   injected `randomFn` for determinism. A hook holding the single `bowl_movies`
   read, the bowl-name join, and the scope selection. A screen: scope selector,
   draw action, result card naming the title and the bowls it sits in, and a
   "pick again" that costs nothing. The result hands off to the existing manual
   watch entry, which hands off to the existing removal offer. No migration, no
   RPC, no new table, no change to any bowl's behavior.
2. **Cost and readout polish.** The manual "check filter matches" path, the
   per-bowl undrawn counts in the selector, and the empty states above.
3. **Only then**, decide whether within-person title weights belong here —
   see `bowl-draw-methods.md`. Solo pick and those weights are the same selection
   step, and building weights first would have meant building them blind.

Guest night inherits the pool primitive from step 1 and should not rebuild it.

## The Version This Replaces

Kept because the analysis is still true if the decision is ever revisited.

A true solo *draw* — one that removes the title from the bowl — would need a
`draw_solo_movie(p_bowl_movie_id)` RPC alongside `draw_bowl_movie`, doing the
same transaction minus the `bowl_draw_events` insert: stamp
`bowl_movies.drawn_at/drawn_by`, insert a `user_watch_events` row with a new
`source_kind` such as `'solo_draw'` added to that column's check constraint. The
schema fits it without a new table, which is exactly what
`20260724123000_add_durable_watch_history.sql` bought by splitting bowl activity
from personal activity. It would also need a visibility answer, a reversibility
path (a solo draw has no draw event, so undo needs its own marker on
`bowl_movies`), a per-candidate permission check, and — pooled — a story for
firing withdrawal events into bowls that were not part of the evening.

That is a substantially larger feature than the picking it adds, and the picking
is the part that was actually missing.

# Selectable Draw Methods

Status: plan only; not implemented. This document sequences the work if it is
picked up. Nothing in the current draw path changes until Phase 1 lands.

## Product Idea

Today every bowl draws exactly one way: pick a contributor at random with equal
probability, then pick one of that contributor's movies at random. That method
is good, and it stays the default. But it is not the only reasonable way for a
group to decide, and some bowls want a different feel — a pure raffle where a
person who added ten movies really does have ten chances, or a rotation where
whoever has not had a pick in a while comes up next.

This plan makes the draw method an explicit, named, bowl-level choice. The bowl
owner picks it in Bowl Settings; every draw in that bowl uses it, no matter who
taps Draw.

## Decisions Already Made

- **The method is a property of the bowl, not of the person drawing.** A draw is
  something the bowl does, and the app already says so ("How this bowl picks").
  If two members drew by different rules, the result would stop being explainable
  and the disclosure copy would become a lie.
- **The bowl owner controls it**, consistent with `draw_access_mode` and bowl
  rename. Members can see the active method; they cannot change it.
- **Person-first stays the default** for new bowls and for every existing bowl.
  Migration must be a no-op in observable behavior.
- **Per-contributor weights are out of scope** for this work. See Deferred.

## The Methods

### 1. Person-first (`person_first`) — default, current behavior

Group the eligible pool into contributor buckets, pick a bucket uniformly, then
pick a movie uniformly inside it. Every person is equally likely regardless of
how many movies they added.

*Feel:* nobody can flood the bowl to improve their odds.

### 2. Title-first (`title_first`)

Pick uniformly across every eligible title. A contributor with ten movies in the
pool is ten times as likely as one with a single movie.

*Feel:* a straight raffle. Every slip in the bowl is one slip.

Note this changes odds for link guests too — `getContributorBucketKey` buckets
anonymous adds under `guest:<name>`, so a guest who added six titles currently
counts as one person and would stop doing so under title-first.

### 3. Rotation (`rotation`) — Phase 2

Restrict the bucket pool to the contributors whose most recent draw in this bowl
is oldest (contributors never drawn rank first), then run person-first inside
that restricted set.

*Feel:* turns. Over a run of movie nights everyone gets picked before anyone
repeats.

This is the only method that needs data the draw path does not already have; see
Rotation Data below. That cost is why it is sequenced second rather than shipped
with the first two.

## Where the Method Applies

This is the load-bearing architectural point, and getting it wrong would break
existing behavior.

The current selection pipeline is:

```
remainingMovies
  → filterCandidatesByRating / Genre / Runtime      (drawSelection.js)
  → streaming-priority narrowing, if enabled        (selectDrawCandidate.js)
  → pickRandomByContributor(pool)                   (selectDrawCandidate.js)
```

The draw method replaces **only the last step**. It runs on whatever pool
survives filtering and streaming priority — it never re-expands the pool and
never reorders the earlier stages. That keeps filters and method composable:
"R-rated, on Netflix, drawn by rotation" is a coherent sentence, and each layer
still means what it meant before.

`selectDrawCandidate` calls `pickRandomByContributor` in two places (the
non-prioritized path at line 52, and the ranked `drawPool` path at line 107).
Both become calls to the selected method. Note the current helper accepts either
raw movie rows or `{ movie, providers, ... }` wrappers via `item?.movie || item`;
every method must preserve that duck-typing, because the two call sites pass
different shapes.

### Proposed module

New `src/utils/drawMethods.js` holding a registry keyed by method id:

```js
{
  id: "person_first",
  label: "Person first",
  description: "…",            // Bowl Settings radio copy
  disclosure: "…",             // DrawMethodDisclosure body copy
  pick(pool, { randomFn, context }),   // pool → one item
  buildOdds(movies, context),          // → [{ bucketKey, member, movieCount, drawOdds }]
}
```

Plus `DEFAULT_DRAW_METHOD = "person_first"` and
`normalizeDrawMethod(value)` that falls back to the default for anything
unrecognized. Normalization matters: a bowl row written by a newer deploy must
not break an older client still in someone's tab.

`selectDrawCandidate` gains a `drawMethod` option defaulting to
`DEFAULT_DRAW_METHOD`, so every existing caller and test keeps working untouched.
`getDrawSelection` passes it through; `useBowl.handleDraw` reads it from bowl
state and forwards it in the same options object that already carries the
filters.

`buildDrawOddsStats` in `drawBuckets.js` moves behind `method.buildOdds` so the
odds model tracks the method instead of hardcoding `1 / bucketCount`.

## Data Model

Mirror `draw_access_mode` exactly — it is the closest precedent in the schema.

```sql
alter table public.bowls
  add column if not exists draw_method text not null default 'person_first';

alter table public.bowls
  add constraint bowls_draw_method_check
  check (draw_method in ('person_first', 'title_first', 'rotation'));
```

A text column with a check constraint, not an enum: adding a fourth method later
is then a plain additive migration rather than a type change.

Writes go through an owner-authorized RPC modeled on `save_bowl_draw_access`:

```sql
create or replace function public.save_bowl_draw_method(p_bowl_id uuid, p_method text)
returns text
language plpgsql security definer set search_path = public
```

…which rejects an unauthenticated caller (`42501`), rejects a non-owner
(`42501`), rejects an unknown method id (`P0001`), and otherwise updates the row.
Validating server-side matters because the check constraint alone would surface
as an opaque database error in the UI.

Files, following the existing convention:

- `supabase/migrations/<ts>_add_bowl_draw_method.sql`
- `supabase/rollback/<ts>_restore_single_draw_method.sql`
- `supabase/tests/<ts>_add_bowl_draw_method.sql`

### Reading the column

`BowlDashboard` already loads the bowl row (`name, owner_id, draw_access_mode`)
and already degrades gracefully when a column is missing, re-querying without it
and treating the feature as absent. Extend that same select and the same fallback
to `draw_method`, so a deploy that reaches users before the migration is applied
falls back to person-first instead of bouncing them to `/bowls`. `BowlSettings`
and `src/tv/hooks/useTvBowls.js` need the same treatment; the TV surface prints
"Person-first random draw" as static text today and must read the real value.

## UI Surfaces

1. **Bowl Settings** — an owner-only radio group next to Draw Access, one row per
   method with a one-line description. Non-owners see the active method as read-only
   text. Save through the RPC, matching how draw access already saves.
2. **`DrawMethodDisclosure`** — currently a static component asserting equal
   per-person odds. It takes a `drawMethod` prop and renders that method's
   disclosure copy. If this component keeps saying "each person is equally
   likely" while a bowl draws title-first, the feature has shipped a falsehood
   into the most trusted sentence in the app.
3. **TV `TvTonightScreen`** — replace the hardcoded "Person-first random draw"
   label with the bowl's method label.
4. **`AboutPage` / `AboutDecisionSpectrum`** — the spectrum copy says every member
   had an equal chance. Reword to describe person-first as the default rather
   than as the only behavior.

`useBowl` exports `drawOdds` and nothing currently renders it, matching the
README's "without surfacing competitive odds." Keep it export-only and correct
per method; do not build new odds UI as part of this work.

## Rotation Data

Person-first and title-first are pure functions of the eligible pool. Rotation is
not — it needs each contributor's last draw time in this bowl.

`useBowl` loads `bowl_draw_events` today, but filtered to `returned_at is null`,
so it is the current watch list rather than full history. Rotation needs the
unfiltered per-contributor maximum. Options, in order of preference:

1. An RPC returning `(bucket_key, last_drawn_at)` for a bowl — one small query,
   no history payload in the client.
2. A separate `bowl_draw_events` select of `added_by, added_by_name, drawn_at`
   ordered descending, reduced client-side.

Either way the result is a `context` object passed into `method.pick`, so
`person_first` and `title_first` continue to ignore it and stay trivially
testable. Fetch it only when the bowl's method is `rotation`.

Edge cases to settle when Phase 2 is specified: a contributor whose titles are
all filtered out is simply absent from the pool and does not stall the rotation;
a contributor who joins mid-bowl has no draw history and therefore sorts first;
when every eligible contributor ties (a fresh bowl, or a completed cycle) the
method degenerates to plain person-first, which is the correct behavior.

## Rollout

**Phase 1 — plumbing and two methods.** Add the column, RPC, and
`drawMethods.js` registry; thread `drawMethod` through `getDrawSelection` →
`selectDrawCandidate`; ship `person_first` and `title_first`; add the Bowl
Settings control and make the disclosure copy method-aware. This is shippable on
its own and is where the compatibility risk lives.

**Phase 2 — rotation.** Add the history source, the `rotation` method, its
constraint value, and its disclosure copy.

**Phase 3 — surfaces.** TV label, About copy, and any settings polish that falls
out of using it.

Phases 1 and 2 each end with the app in a coherent, explainable state.

## Testing

Per `STABILITY.md`, this touches two high-risk areas (`useBowl.js`,
`BowlSettings.jsx`) plus migrations, so tests come with the change rather than
after it.

- `drawMethods` unit tests with an injected `randomFn`: distribution shape for
  each method, single-contributor degeneracy (all methods agree), single-movie
  pool, and the `{ movie }`-wrapper vs raw-row duck-typing.
- `selectDrawCandidate` regression: **omitting `drawMethod` reproduces today's
  output exactly.** The existing suite passing unmodified is the real proof.
- Method composed with streaming priority: the method picks from the narrowed
  ranked pool, not from all remaining titles.
- `normalizeDrawMethod` maps `null`, `""`, and an unknown id to person-first.
- Permissions: owner can save the method, member cannot (`42501`), unknown id is
  rejected (`P0001`) — the owner-vs-member boundary `STABILITY.md` calls for.
- `BowlDashboard` renders and draws normally when the `draw_method` column is
  absent.
- Disclosure copy matches the active method.

Manual QA before merge: draw in a person-first bowl and confirm nothing about the
experience changed; switch a bowl to title-first and confirm the disclosure text
changes with it.

## Risks

- **Silent behavior change on existing bowls.** Mitigated by defaulting the
  column, defaulting the function argument, and treating an unmodified
  `selectDrawCandidate` suite as a merge gate.
- **Copy drifting from behavior.** The disclosure, the TV label, and the About
  spectrum all currently hardcode equal-per-person odds in three separate places.
  Route all three through the registry's `disclosure`/`label` so there is one
  source of truth.
- **Deploy ordering.** Frontend can reach users before `supabase db push` runs.
  The missing-column fallback described above is what keeps that from being an
  outage.
- **Method proliferation.** Three named methods is a real settings decision for
  an owner to make; more than that becomes a menu nobody reads. Additional
  methods should have to displace an existing one.

## Recorded Idea: Within-Person Title Weights

Status: idea, not part of the phases above.

Let a contributor control the relative odds **among their own titles** while
every person stays equally likely to be selected. You have been meaning to watch
one of your six for a year and added another on a whim; those should not be
coin-flips against each other, and saying so should not cost anyone else a thing.

This is a different feature from the between-person weights listed under
Deferred, and the distinction is what makes it attractive:

- *Between-person* weights change who gets picked. They alter the group's
  fairness bargain and need to be a bowl-level, owner-controlled decision.
- *Within-person* weights change only which of your own titles comes up once
  you have already been selected. They are self-competition. Nobody else's odds
  move, so this can be a purely personal setting with no owner involvement and no
  group negotiation.

### Where it plugs in

`pickRandomByContributor` is already two steps: pick a bucket, then
`pickRandom(bucket)`. Weights replace only the second step with a weighted pick.
That is a strictly local change inside the method registry's `person_first` (and
`rotation`) implementation, and it leaves bucket selection untouched.

### It only means something under person-first

Under `title_first` there is no inner step to parameterize — titles are drawn
uniformly across the whole pool, so any personal weight would move that person's
total share and leak straight into cross-person fairness. That is precisely the
property this idea is supposed to preserve.

So the rule should be that weights apply under `person_first` and `rotation`, and
`title_first` ignores them — stated plainly in the UI, because a slider that
silently does nothing in some bowls is worse than no slider.

### Open questions

- **Storage.** `bowl_movies.draw_weight numeric not null default 1` is the
  natural home; the row already carries `added_by`, so an update policy scoped to
  `added_by = auth.uid()` gives the right permission boundary. Check this against
  `20260726153000_tighten_profile_and_bowl_movie_access.sql` before assuming an
  update path exists.
- **How weights are expressed.** Raw numbers turn a movie list into a
  spreadsheet. A coarse ordinal — three to five levels along the lines of "someday
  / normal / eager" mapped to fixed multipliers — is likely to get used, and keeps
  the odds legible without ever printing a percentage.
- **Is zero allowed?** A weight of 0 means "never draw this," which is really a
  snooze, and an undrawable title sitting silently in the list is a trap. Prefer a
  floor above zero and, if pausing a title is wanted, build it as an explicit
  visible state rather than as a side effect of a slider bottoming out.
- **Link-guest rows.** Titles added through a public add link carry the link
  creator's `added_by`, so they would technically be weightable by that person.
  Harmless, but worth deciding rather than discovering.
- **Disclosure copy.** "Then selects one of their movies at random" stops being
  true and becomes "weighted by that person's preferences." Same three hardcoded
  copy sites as the rest of this document.

Solo draw (`solo-draw.md`) is a single-contributor pool, which means these
weights would *be* its entire selection logic. If both get built, this one goes
first.

## Deferred

- **Between-person weights** (a 2x boost for a new member, or dialing yourself
  down relative to others). Deliberately excluded here, and distinct from the
  within-person weights recorded above. If they are wanted later, the scalar
  `draw_method` column should probably become a `draw_config jsonb` blob so the
  method and its parameters travel together — worth revisiting before adding a
  second bowl-level draw knob.
- **Per-user override of the bowl's method.** Rejected above; revisit only if
  bowls actually ask for it.
- **Exposing numeric odds in the UI.** The README's stance is that the method is
  explained and competitive odds are not surfaced. This work does not change that.
- **Method-aware draw history** ("drawn by rotation on Mar 3"). Not needed to
  ship, but the draw event row is where it would go.

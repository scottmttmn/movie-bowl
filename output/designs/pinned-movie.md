# The Pinned Movie

Status: plan, not implemented. Nothing in the repo sets or reads a pin today —
there is no `is_pinned` column, no save RPC, and no control on the My Movies
card. Everything below is a proposal.

## Product Idea

A contributor can pin **one** of their own undrawn movies in a bowl. When the
bowl selects that person, their pinned movie is the one that comes up instead of
a random title from their pile.

The problem it solves is small and real. You have been meaning to watch one of
your six for a year, and you added another on a whim last Tuesday. Person-first
already promises those two are coin-flips against each other. That promise is
about *people*, not about your own titles, and honoring it inside your own pile
buys nobody anything — least of all you.

The pin is deliberately the smallest possible answer. One movie, one tap, no
numbers. Nobody else's odds move, so it needs no owner setting, no group
negotiation, and no new fairness copy about who gets picked.

## Why This Is Worth Building Now

Two things landed recently that this plan is built on. Neither existed when
`bowl-draw-methods.md` recorded within-person weights as a someday idea, and
both change what is cheap.

**My Movies became a real personal surface.** `MyMoviesStrip` already sorts by
eligibility, and `MovieActionCard` already renders an excluded title greyed and
labelled. There is now a per-card place for a personal affordance and an
existing ordering rule to extend — a pin does not have to invent either.

**Your titles' filter and service status resolves effectively instantly.**
`get_bowl_filter_metadata` returns certification and providers for the whole
bowl in one RPC, kept warm by the daily
`api/cron/refresh-filter-metadata` job, and `useBowlFilterMetadata` exposes
`hasCompleteMetadataSnapshot`, which skips the 100-title manual gate entirely.
For a bowl inside the warm cache, `useMyMovieEligibility` reaches
`MY_MOVIE_ELIGIBILITY_STATUS.ready` on the first paint.

That second one is what makes a pin honest rather than a trap. A pinned movie
that tonight's filters exclude *cannot* be drawn, and the whole feature would be
a lie if the app could not say so. Before the persistent cache, the card would
have had to either claim something it had not checked or sit behind a spinner.
Now the strip already knows: `eligibleMovieIds` is on hand, and the pin's state
line is derived from data the screen holds, with no new fetch of any kind.

## Product Decisions

- **One pin per person per bowl.** Pinning a second movie moves the pin. This
  single constraint is what keeps the feature from becoming personal ordering.
- **The pin decides only the within-person step.** It never changes who is
  selected, never re-expands the pool, and never reorders filtering or streaming
  priority. Per-contributor odds are unchanged, which is why
  `buildDrawOddsStats` needs no edit.
- **It applies under `person_first` and `rotation`; `title_first` ignores it.**
  Title-first has no per-person step to parameterize, so honoring a pin there
  would move that person's total share of the draw — exactly the cross-person
  fairness this feature must not touch. The bowl says so out loud; a control
  that silently does nothing is worse than no control.
- **A pinned movie outside the eligible pool is skipped.** The bucket falls back
  to a random eligible title of that person's. The alternative — letting a pin
  push an ineligible title past the filters — breaks the filter contract, and
  emptying that person's bucket instead would remove them from the draw, which
  is a between-person effect.
- **The pin is private before the draw.** Only its owner sees which movie is
  pinned. That matches how the app already conceals the bowl's contents, and it
  is UI-level concealment rather than a new confidentiality boundary — members
  can already select `bowl_movies` rows.
- **The rule is public even though the pin is private.** The method disclosure
  gains a sentence saying a pinned movie comes up first. It names the rule, not
  the person or the title.
- **Drawing a pinned movie clears the pin.** The slip leaves the remaining pool.
  Returning that movie to the bowl does not restore the pin — re-pinning is one
  tap, and a pin that silently reappears months later is a surprise.
- **Deleting the pinned movie clears the pin** implicitly; the row is gone.
- **Public add-link guests cannot pin.** They have no durable identity, the same
  reason they cannot edit a comment after submitting one.
- **Optimistic rows cannot be pinned.** A `local_status: "syncing"` row has no
  server id yet and is excluded from draws; the control stays disabled until it
  persists.

## Where the Pin Applies

The pipeline this repo already commits to:

```
remainingMovies
  → rating / genre / runtime filters                 (drawSelection.js)
  → streaming-priority narrowing, if enabled         (selectDrawCandidate.js)
  → method-specific selection                        (client or rotation RPC)
  → atomic draw persistence                          (Supabase RPC)
```

The draw method replaces only the last step. The pin replaces only the *second
half* of that last step — the "then one of their movies" part — and only for
methods that have one.

That nesting is what makes the eligibility rule fall out for free rather than
needing a branch. Both selection paths already operate on the resolved eligible
pool, so a filtered-out pin is simply not present to be preferred. There is no
code anywhere that has to check "is the pin still allowed"; it cannot be reached
if it is not.

## Language and Copy

Method copy has one source of truth — the `drawMethods.js` registry — so the
strip reads the "pins don't apply here" line from the method rather than
hardcoding it.

### Registry additions

```js
// person_first, rotation
honorsPin: true,

// title_first
honorsPin: false,
pinNote: "This bowl draws title-first, so pins don't change anything here.",
```

Appended to `PERSON_FIRST.disclosure` and, adapted, to `ROTATION.disclosure`:

> If that person pinned one of their eligible movies, the bowl picks the pinned
> movie instead of choosing at random. Pinning never changes who is selected.

Appended to `TITLE_FIRST.disclosure`:

> This bowl ignores pinned movies, because there is no per-person step to apply
> them to.

Leave the short `description` strings alone. They describe how the bowl chooses
a *person*, which the pin does not affect, and the disclosure is where the full
rule belongs.

### My Movies card

- Control label (screen reader): **Pin "Title" so it comes up first when you're
  picked** / **Unpin "Title"**
- Badge on the pinned card: **Pinned**
- Eligible, once eligibility is `ready`: **Up first when you're picked**
- Excluded, once eligibility is `ready`: **Outside tonight's filters — a random
  title of yours would come up instead**
- Eligibility `idle`, `manual`, or `checking`: the badge alone, with no claim
  about tonight. The point of this feature is not guessing.
- Save failure: **Could not pin this movie. Please try again.** — rendered in
  the existing `myMoviesErrorMessage` slot.

### Duplicate add refusal

`DUPLICATE_MOVIE_MESSAGE` in `useBowl` currently reads *This movie is already in
the bowl.* — true, and a dead end. It becomes, with the contributor resolved
from the existing slip:

> **"Title" is already in the bowl — <name> added it, so it can come up on their
> turn.**

Falling back to the current sentence when no name resolves. See the edge-case
section below for why this is the whole fix for now.

## Intended Experience

1. You open My Movies in a bowl. Your titles are already ordered eligible-first,
   as they are today.
2. You tap the pin control in the corner of one card. The badge appears, the
   card moves to the front of the strip, and the line under the title says
   whether it is actually in tonight's pool.
3. If you pin a second title, the badge moves. There is no confirmation step and
   no "you already have a pin" dialog — moving a pin is the whole gesture.
4. Somebody draws. If the bowl picks you and your pin survived the filters, your
   pinned movie is the reveal. If it did not survive, one of your eligible
   titles comes up, which is what the card told you would happen.
5. After a draw of your pinned movie, the pin is gone. The next thing you pin is
   a fresh decision.

In a `title_first` bowl, the strip header carries the registry's `pinNote` and
the pin controls are not rendered at all. A pin saved in another bowl is
untouched; pins are per slip, so there is nothing to migrate or explain.

## Data Model

One nullable-free boolean on the slip, following the `note` precedent from
`20260822120000_add_movie_comments.sql`:

```sql
alter table public.bowl_movies
  add column is_pinned boolean not null default false;

create unique index bowl_movies_one_pin_per_contributor
  on public.bowl_movies (bowl_id, added_by)
  where is_pinned and added_by is not null and drawn_at is null;
```

The partial unique index is load-bearing, not decoration. "One pin" has to be a
database fact, or two tabs racing each other leave you with two pins and a
person-first bucket that picks between them arbitrarily — which is the ordering
feature, arrived at by accident. Including `drawn_at is null` in the predicate
keeps the index independent of the clear-on-draw behavior below, so neither one
has to be correct for the other to hold.

### Saving a pin

`authenticated` holds only `select, insert, delete` on `bowl_movies` after
`20260726153000_tighten_profile_and_bowl_movie_access.sql`. There is no update
grant and no update policy, which is why comment edits go through a
security-definer RPC. Pinning does the same:

```sql
public.set_own_bowl_movie_pin(
  p_bowl_movie_id uuid,
  p_pinned boolean
)
returns public.bowl_movies
```

`security definer`, `set search_path = public`, and mirroring
`update_own_bowl_movie_note`'s ownership predicate exactly — `added_by =
auth.uid() and added_by_name is null and added_via_link_id is null and drawn_at
is null` — so link-guest rows and drawn slips are rejected by the same rule that
governs comments.

Pinning clears the caller's existing pin in the bowl and sets the new one **in
one statement pair inside the same transaction**, rather than asking the client
to unpin and then pin. A client-side clear-then-set can be interrupted, and
leaving someone with zero pins because their phone lost signal halfway is a
worse failure than the one the index is protecting against.

Not found raises `P0001` with *This movie is no longer available to pin.*,
matching the comment RPC's error vocabulary so `useBowl` can keep one failure-
message mapper.

### Clearing on draw

`public._record_bowl_movie_draw` is already the single private persistence
helper both draw RPCs call; its current definition lives in
`20260823120000_use_local_watch_dates.sql`. Add `is_pinned = false` to the
`update public.bowl_movies` it already performs. One place, both draw paths,
no chance of the ordinary and rotation paths drifting.

## Selection

### Client — `person_first`

`PERSON_FIRST.pick` already chooses a bucket and then `pickUniform`s inside it.
The pin replaces only the inner call:

```js
pick(pool, { randomFn = Math.random } = {}) {
  const buckets = groupByContributor(pool);
  const bucket = pickUniform(buckets, randomFn);
  const pinned = bucket.find((item) => getMovieFromItem(item)?.is_pinned);
  return pinned || pickUniform(bucket, randomFn);
}
```

`getMovieFromItem` is already there because selection runs on both raw rows and
`{ movie, providers }` wrappers; the pin read must go through it for the same
reason every other field does. Bucket selection is untouched, which is the
property the tests need to pin down.

`TITLE_FIRST.pick` needs no change at all — it never buckets, so ignoring the
pin is structural rather than a special case. That is worth preserving as-is
rather than adding an explicit `honorsPin` check to the pick function.

### Server — `rotation`

The rotation RPC already holds the rows; it selects within the chosen bucket
with a bare `order by random()`. Carry `movie.is_pinned` through the
`candidate_movies` CTE and change the final selection to:

```sql
order by candidate.is_pinned desc, random()
```

The bucket choice above it — never-drawn first, then oldest `last_drawn_at`,
random tie-break — does not change. A pin does not jump the turn; it decides
what happens once the turn arrives.

### Client read path

`useBowl`'s remaining-movies query selects an explicit column list, so add
`is_pinned` to it. Until that ships, an older cached client simply never sees
the column and picks randomly — see the rollout note below, which is why nothing
may be able to *set* a pin before the client can read one.

## UI Surfaces

**`MovieActionCard`** gets an optional pin control as a small `icon-btn`
overlaid on the poster's top-right corner, with `aria-pressed`. It stays out of
the two-button action row: a third button in a 144px card crowds Details and
Delete into unusable targets. The pin props are optional, so any future consumer
of the card is unaffected by their absence. The card is currently used only by
`MyMoviesStrip`, so nothing else changes; `WatchedMovieCard` is a separate
component and stays untouched.

**`MyMoviesStrip`** ordering becomes: pinned-and-eligible, then the rest of the
eligible, then excluded, then syncing. A pinned-but-excluded card keeps its
badge and its excluded treatment and stays in the excluded group. The ordering
must not contradict the eligibility it is rendering — the pin does not beat the
filter, so it does not get to look like it does.

**Method disclosure and `DrawMethodInfoModal`** pick up the new sentence from
the registry with no component change. So does Bowl Settings, and so does the TV
method label, which reads `tvLabel` and the disclosure off the same registry.

**Nothing else.** In particular:

- No pin segment in `BowlStatLine`. That line is a readout of the pool, not of
  you, and a fourth segment is how it stops being one quiet sentence.
- No pin control on TV. Pinning is a personal act performed before movie night,
  not something to do with a D-pad in front of the room. TV changes zero lines.
- No group-facing "this was someone's pin" in the reveal. See Open Questions.

## Rollout

Deploy the migration before the frontend, as with every draw change.

**Phase 1 — data and server authority.** One migration adding the column, the
partial unique index, `set_own_bowl_movie_pin`, the `is_pinned = false` line in
`_record_bowl_movie_draw`, and the rotation RPC's `order by`. Plus its pgTAP
file and its rollback.

**Phase 2 — client selection, control, and copy.** `is_pinned` in the `useBowl`
select list, the `PERSON_FIRST.pick` change, the registry copy and `honorsPin`
flags, the card control, the strip ordering, the `useBowl` handler that calls
the RPC and returns an `addResult`-shaped result, and the duplicate-refusal
copy above.

The two phases have one ordering constraint worth stating, because it is easy to
get backwards. Phase 1 makes rotation bowls honor pins while person-first bowls
still do not. That asymmetry is invisible only because **nothing can create a
pin until Phase 2 ships the only control that calls the RPC**. If Phase 1 ever
ships with a way to set a pin — a debug path, a manual SQL update — two bowls
using different methods would behave differently for no reason a user could see.

Rollback drops the index and column, restores the two functions to their
current definitions, and notes plainly that every saved pin is discarded. That
is a real behavior change, and it belongs in the rollback file rather than
turning up as a missing column at runtime.

Files, following the existing convention:

- `supabase/migrations/<ts>_add_pinned_bowl_movies.sql`
- `supabase/rollback/<ts>_remove_pinned_bowl_movies.sql`
- `supabase/tests/<ts>_add_pinned_bowl_movies.sql`

## Testing

Per `STABILITY.md` this touches `useBowl.js` and migrations, so the tests come
with the change. Refresh the clean-checkout counts in `CLAUDE.md` in the same
commit that adds them.

### JavaScript and UI

- `drawMethods`: with an injected `randomFn`, person-first prefers the pinned
  item in the chosen bucket, and the *bucket* choice is byte-for-byte what it
  was before. Unpinned buckets keep uniform selection. The pinned item is found
  through both raw rows and `{ movie, providers }` wrappers.
- `drawMethods`: title-first ignores `is_pinned` entirely, and `honorsPin` /
  `pinNote` are present with the right values on all three methods.
- `drawMethods`: `buildDrawOddsStats` output is unchanged by any pin. This is
  the regression test that the feature is fairness-neutral, so write it even
  though no code changed.
- `MyMoviesStrip`: ordering across the pinned × eligible matrix, including
  pinned-and-excluded staying in the excluded group with its badge, and syncing
  rows staying last with the control disabled.
- `MyMoviesStrip`: the `pinNote` renders and pin controls are absent in a
  title-first bowl.
- `MovieActionCard`: `aria-pressed` reflects state; the control is absent when
  the pin props are not passed.
- `useBowl`: the pin handler sends the expected RPC arguments, returns an
  `{ ok, code, message }` result rather than throwing, surfaces the permission
  and not-found errors as the copy above, and reflects a cleared pin after a
  draw reload.
- Existing person-first, title-first, and rotation suites stay unchanged as the
  regression gate. A pool with no pins must reproduce today's behavior exactly.

### Database

- Owner of the slip can pin and unpin; another member, an outsider, and an
  anonymous caller cannot.
- Link-guest rows (`added_by_name` or `added_via_link_id` set) are rejected.
- A drawn slip is rejected.
- Pinning a second title clears the first, in one transaction, leaving exactly
  one pinned row for that `(bowl_id, added_by)`.
- The partial unique index rejects a second pin inserted around the RPC.
- Rotation prefers the pinned candidate inside the selected bucket, and — the
  test that matters most — rotation's *bucket* order is unaffected by a pin: a
  contributor with a pin does not move up the turn order.
- A pin on a movie that is not in the candidate list is never selected.
- Drawing a pinned movie leaves `is_pinned` false, through both the ordinary and
  the rotation RPC.

Run `npm run test:run` and `npm run build`. Manual QA: pin a title and draw
until your bucket comes up; pin a title and then set a filter that excludes it,
confirming the card says so and the draw picks something else of yours; pin in a
rotation bowl and confirm your turn does not arrive sooner; switch a bowl to
title-first and confirm the note appears and the pin is inert; draw your pinned
movie and confirm the pin is gone, including after returning it to the bowl.

## Risks

- **The pin becomes a between-person lever.** It must never empty a bucket or
  push an ineligible title through. Both are prevented structurally by operating
  on the resolved pool — keep it that way rather than adding a guard that could
  be removed.
- **Two pins.** The partial unique index, plus a single-transaction save.
- **A pin that silently does nothing.** Three ways this happens — title-first
  bowl, filtered out, movie drawn — and each has explicit copy above. This is
  the failure mode most likely to make people distrust the feature.
- **Client and SQL selection drift.** "Prefer the pinned candidate" now lives in
  `drawMethods.js` and in the rotation RPC, the same shape of risk as the bucket
  key. Test both sides.
- **A stale claim about eligibility.** The card's state line is only as fresh as
  `eligibleMovieIds`. Render no claim at all when eligibility has not resolved,
  rather than a stale one.
- **Scope creep into ordering.** The first request after this ships will be a
  second pin. That is the personal-ordering feature, and it needs its own design
  covering link-guest ownership, accessible reordering, and where new and
  returned movies land. A second pin is not a small change to this one.

## Edge Case: Somebody Else Already Added It

`20260723200000_prevent_duplicate_active_movies.sql` allows one active slip per
`(bowl_id, tmdb_id)`. So if another member already added the movie you have been
meaning to watch for a year, you cannot add it, which means you cannot pin it —
the exact title the feature exists for is the one it cannot reach.

Two things about that constraint are worth having in front of you before
choosing a fix. Its registry table already carries an `active_count` column and
was backfilled from existing duplicates rather than deduping them, so the schema
already models "N active slips for this title." And the trigger only registers
`tmdb_id > 0`, so **duplicate custom titles are already allowed today**. One slip
per title is a TMDB-lookup rule, not a product principle, and the bowl already
breaks it.

### Why the pin is hard to retarget

The pin is defined relative to a **bucket**: "when the bowl picks me, this comes
up." Any fix has to answer whose bucket the shared title sits in. That question
is what separates the options, and it is why the cheaper-looking one is not
actually cheaper.

### Option A — co-adders on one slip

Record that two people added the same slip, and let either pin it.

Socially this is the right description of what happened. But one slip in two
buckets breaks the bucketing invariant everywhere — `getContributorBucketKey`
returns one key, the rotation RPC's SQL bucket expression returns one key, and
`bowl_draw_events.added_by` records one person. Worse, there is no non-arbitrary
answer to whose turn it spends: if a co-added movie is drawn under rotation, it
either burns both turns, one arbitrary turn, or neither, and all three are
defensible. That is a fairness decision the feature has no basis for making.

Not recommended — not because it is expensive, but because it has no correct
answer.

### Option B — let members pin each other's movies

Cheaper in code, but it does not mean anything. Under person-first, your pin on
someone else's slip is either inert (their bucket, their pin) or it steers *their*
turn, which is a between-person effect and contradicts the plan's central rule
that a pin never changes anyone else's draw. If two people pin different movies
of a third person's, there is no tie-break that isn't arbitrary.

It also costs the concealment the bowl is built on — every member browsing every
member's titles is a different product than a bowl you cannot see into.

Not recommended, on both counts.

### Option C — one slip per person, deduped at the draw

Change the uniqueness rule from `(bowl_id, tmdb_id)` to
`(bowl_id, tmdb_id, added_by)`. You and I both want Heat, we each get a slip, in
our own buckets, each pinnable by its owner. When either slip is drawn, the
siblings retire.

This is the option that matches the physical bowl **better**, not worse. Two
people who both want a movie write two slips and both go in; nothing about a
bowl of paper stops them, and the app already permits exactly this for custom
titles. The current rule is a convenience of the TMDB registry.

The fairness story is also free under the default method, which is the part
worth noticing. Person-first fixes every contributor's share at 1/N regardless
of how many slips they hold, so a second person adding the same title costs
nobody anything — it only makes that title more likely to be the thing that
fills somebody's turn, which is the correct signal: two people want it. Rotation
is unaffected for the same reason. Under title-first three slips are three
chances, which is coherent with title-first's own stated promise.

The real costs, all nameable:

- **Pool counts double-count.** "12 of 30 eligible" would count one movie twice.
  Needs a decision: count slips (honest about the draw) or count titles (honest
  about the night).
- **Sibling retirement is a silent removal.** Drawing Heat off my slip makes your
  slip vanish from your My Movies. That is the same shape as the existing
  untraceable-removal item in `TODO.md`, and it should probably be visible
  ("watched — someone else's slip came up") rather than a shrinking list.
- **The registry table and trigger both change**, including `active_count`
  semantics. Its pgTAP coverage is the gate.

### Recommendation

**Do not fold any of this into the pin.** Option C is the right fix and it is its
own feature — it changes what a bowl *is* slightly, and it has three open
questions of its own that have nothing to do with pinning.

Ship the pin with the cheap honest version instead: when an add is refused as a
duplicate, stop saying only *This movie is already in the bowl.* and say that it
is in the bowl and can come up on the turn of whoever added it. That converts a
dead end into information, costs one copy change plus the contributor name, and
is true whether or not Option C is ever built.

Then let the complaint decide. If people keep hitting the refusal and keep
wanting their own turn to produce that title, Option C has earned its design
doc. If they mostly just wanted the movie in the bowl — which the refusal
already achieves — nothing more is needed.

## Open Questions

- ~~Should the group ever see a pin?~~ **Decided: no.** The pin is a private
  nudge; making it public turns it into a claim on the room.
- ~~Should returning a drawn movie restore the pin?~~ **Decided: no.** Re-pinning
  is one tap, and a pin that silently reappears months later is a surprise.
- **Does the duplicate-refusal copy need the contributor's name?** Naming who
  already added it is the useful half of the message, but it discloses one slip's
  contributor before the draw. Probably fine — you learn it by being refused,
  about a title you already chose — but it is a real edge of the concealment
  rule.
- **Does a pin deserve to survive a filter it barely misses?** No. Recording it
  because it is the tempting wrong answer, and because someone will ask.
- **Should a bowl owner be able to turn pins off?** Only if pins turn out to
  bother people, and the evidence would be a complaint, not a hypothetical. It
  would be a second bowl-level draw knob, which `bowl-draw-methods.md` already
  flags as the point where `draw_method` should probably become `draw_config`.

## Relationship to Recorded Ideas

This supersedes nothing and unblocks two things.

**Within-person title weights** (`bowl-draw-methods.md`) is the same idea with a
dial instead of a switch. A pin is the degenerate case: one title at weight
infinity, the rest equal. If weights are ever wanted, they generalize this
column rather than replacing it, and by then there will be evidence about
whether anyone wants more resolution than "this one."

**Personal movie ordering** (`TODO.md`) is the same idea with a full rank order,
and it carries the drag-and-drop, link-guest-ownership, and new-title-placement
problems that this plan deliberately does not have. Shipping the pin first is
also the cheapest way to find out whether ordering is wanted at all.

**Solo draw** (`solo-draw.md`) is a single-contributor pool, so a pin there
would decide the entire draw. That is probably correct behavior, but it should
be confirmed in that plan rather than assumed here.

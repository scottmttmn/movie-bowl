# Selectable Draw Methods

Status: shipped — `person_first`, `title_first`, and contributor-history
`rotation` are live as owner-set bowl methods. Rotation uses the exact resolved
eligible pool and an atomic database draw; personal movie ordering remains a
separate future feature.

## Product Idea

Movie Bowl ships with person-first as the default and title-first as an optional
straight raffle. Person-first is good, and it stays the default, but some bowls
want a different feel: a rotation where whoever has not had a pick in a while
comes up next.

Phase 1 made the draw method an explicit, named, bowl-level choice. This plan
extends that model with rotation. The bowl owner still picks the method in Bowl
Settings, and every draw in that bowl uses it no matter who taps Draw.

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

### 3. Rotation (`rotation`)

Start with the actual eligible pool after rating, genre, runtime, and streaming
priority. Group it by contributor, keep only the contributors whose most recent
draw in this bowl is oldest, randomly break a tie between those contributors,
then randomly choose one of that contributor's eligible movies. Contributors
who have never had one of their movies drawn rank ahead of everyone with draw
history.

*Feel:* turns. Over a run of movie nights everyone gets picked before anyone
repeats.

This is the only method that needs durable draw history and transactional
selection; see Rotation Authority and Data below.

### Rotation contract

- Rotation is among **contributors represented in the actual eligible pool**,
  not every member of the bowl. A contributor whose titles are all filtered out
  does not stall the rotation; when one of their titles becomes eligible again,
  their older history naturally moves them toward the front.
- A draw counts as that contributor's turn even if the movie is later returned
  to the bowl. `bowl_draw_events` is the durable fact that the draw happened;
  `returned_at` changes current bowl state, not history.
- All successful bowl draws count, including draws made before rotation was
  enabled and draws made while another method was active. Switching to rotation
  therefore starts from the bowl's real history instead of resetting fairness.
- A newly represented contributor has no history and goes before contributors
  who have already had a turn. Multiple never-drawn contributors tie and are
  chosen randomly until each has appeared once.
- Registered contributors use their stable user id. Public add-link guests keep
  the existing `getContributorBucketKey` behavior: names are case-insensitive,
  and unnamed adds share the `Link Guest` bucket.
- The second step stays random. Rotation decides **whose turn** it is; it does
  not create a personal movie queue or decide which of that person's movies is
  most wanted.

### Movie ordering is a separate feature

Rotation does not require people to order their movies. Ordering would replace
the second random step with "take my highest-ranked eligible title" and would
introduce its own product and data decisions: who may reorder link-guest titles,
where new and returned movies land, whether ordering also affects person-first,
and how drag-and-drop degrades for keyboard and touch users. Keep that work out
of rotation and give it its own design before adding a rank column or reorder UI.

## Where the Method Applies

This is the load-bearing architectural point, and getting it wrong would break
existing behavior.

The current selection pipeline is:

```
remainingMovies
  → rating / genre / runtime filters                 (drawSelection.js)
  → streaming-priority narrowing, if enabled         (selectDrawCandidate.js)
  → method-specific selection                        (client or rotation RPC)
  → atomic draw persistence                          (Supabase RPC)
```

The draw method replaces **only the last step**. It runs on whatever pool
survives filtering and streaming priority — it never re-expands the pool and
never reorders the earlier stages. That keeps filters and method composable:
"R-rated, on Netflix, drawn by rotation" is a coherent sentence, and each layer
still means what it meant before.

Person-first and title-first route through `src/utils/drawMethods.js`. Rotation
adds a named eligible-pool resolver to the existing
`getDrawSelection` / `selectDrawCandidate` split. It returns the
same raw rows or `{ movie, providers, ... }` wrappers the existing code uses,
after every narrowing stage has run. Person-first and title-first continue to
pick in the client. Rotation sends only the ids from that resolved pool to its
atomic RPC, then maps the returned id back to the resolved candidate so provider
metadata and custom/manual-title behavior stay unchanged.

The resolver must not fetch providers for the whole bowl when streaming priority
is off. In that path, resolve the ordinary filters, let the rotation RPC choose
an id, and fetch providers only for the selected positive TMDB id, matching the
current non-prioritized cost.

### Method registry

Rotation is a third registry entry rather than a parallel selection table:

```js
{
  id: "rotation",
  label: "Rotation",
  description: "Picks someone who has waited longest, then one of their eligible movies.",
  disclosure: "…",
  tvLabel: "Contributor rotation",
  bucketsByContributor: true,
  selectionMode: "server_rotation"
}
```

`selectionMode` keeps the branch declarative and prevents
`selectDrawCandidate` from accidentally treating rotation as person-first.
`bucketsByContributor: true` lets the existing stat-line and method-info reach
warning work without special casing. Add `tvLabel` (with fallbacks for the two
existing methods) instead of continuing to append the hardcoded words "random
draw" to every label.

`normalizeDrawMethod` recognizes `rotation` and keeps its unknown-value fallback
for forward compatibility. An older client will still
normalize it to person-first, so the database guard described below must reject
an ordinary draw from a rotation bowl rather than silently use the wrong method.

Rotation does not add an odds UI. The unused `useBowl.drawOdds` export was
removed because it cannot describe rotation honestly without both the resolved
pool and current history. `buildDrawOddsStats` remains available for the two
methods it currently supports. A
future odds surface must solve the eligible-pool TODO for every method first.

## Data Model

Phase 1 added the text column and owner-authorized save RPC. The rotation
migration extends both allow-lists from two methods to three:

```sql
alter table public.bowls
  drop constraint if exists bowls_draw_method_check,
  add constraint bowls_draw_method_check
  check (draw_method in ('person_first', 'title_first', 'rotation'));
```

Update `save_bowl_draw_method` to accept `rotation`; its existing unauthenticated,
non-owner, and unknown-method behavior stays unchanged.

Files, following the existing convention:

- `supabase/migrations/<ts>_add_rotation_draw_method.sql`
- `supabase/rollback/<ts>_remove_rotation_draw_method.sql`
- `supabase/tests/<ts>_add_rotation_draw_method.sql`

No `bowl_movies` ordering, rank, or weight column belongs in this migration.
The migration adds an unfiltered `(bowl_id, drawn_at desc)` index on
`bowl_draw_events`; the
existing history index covers only events that have not been returned, while
rotation deliberately reads both returned and unreturned events. No history
backfill is needed: durable draw events already include the legacy rows migrated
when watch history was introduced.

## UI Surfaces

Most surfaces already consume the registry, so adding the entry automatically
adds the owner radio option, the member read-only view, and the phone method-info
copy. The focused UI work is:

1. Use copy that says rotation is based on eligible contributors and that the
   title within the selected person's pool is random.
2. Keep the existing contributor-reach warning because filters and streaming
   priority can still remove someone from this draw.
3. Replace TV's `"${method.label} random draw"` concatenation with the registry's
   `tvLabel` so rotation is not described as a plain random draw.
4. Do not show "next person," last-turn timestamps, numeric odds, or ordering
   controls. Those surfaces expose more group history and product policy than
   the method needs to work.

## Rotation Authority and Data

Do not fetch full history into `useBowl` and choose from a stale client snapshot.
Two authorized people can draw at nearly the same time; if both saw the same
oldest contributor, separate read and write calls could give that contributor
two consecutive turns. Rotation's fairness promise should be enforced in the
transaction that records the draw.

Rotation uses a security-definer RPC with a fixed `search_path`:

```sql
public.draw_bowl_movie_by_rotation(
  p_bowl_id uuid,
  p_candidate_movie_ids uuid[]
)
returns table (
  bowl_movie_id uuid,
  draw_event_id uuid,
  drawn_at timestamptz
)
```

The client passes the ids from the exact resolved eligible pool. Inside one
transaction, the function:

1. Requires authentication and `can_draw_from_bowl(p_bowl_id)`.
2. Locks the bowl row so rotation draws for one bowl serialize.
3. Confirms the bowl currently uses `rotation`, deduplicates the candidate ids,
   rejects an empty or oversized list, and ignores ids that are from another
   bowl or are no longer undrawn.
4. Builds contributor buckets from the remaining candidate rows using the same
   user-id / normalized guest-name contract as `getContributorBucketKey`.
5. Reads the maximum `drawn_at` for those buckets from **all** matching
   `bowl_draw_events`, without filtering on `returned_at` or draw method.
6. Chooses uniformly among never-drawn buckets if any exist; otherwise chooses
   uniformly among the buckets tied for the oldest timestamp. It then chooses
   one candidate movie uniformly inside that bucket.
7. Records the draw through one private persistence helper shared with the
   existing `draw_bowl_movie`, so the bowl event and participant watch events
   still have exactly one implementation.

The existing `draw_bowl_movie(uuid)` RPC rejects a draw when the bowl now
uses rotation. This turns an older cached client into a clear refresh/error case
instead of silently performing person-first selection. The rotation RPC returns
the chosen movie id; `useBowl.handleDraw` finds that id in its resolved candidate
list, attaches any provider metadata, reloads the bowl, and returns the same
shape callers receive today.

## Rollout

**Phase 1 — plumbing and two methods.** *Shipped.* The column, RPC, and
`drawMethods.js` registry; `drawMethod` threaded through `getDrawSelection` →
`selectDrawCandidate`; `person_first` and `title_first`; the Bowl Settings
control, owner-editable and read-only for members.

The TV label and About copy shipped with it rather than in Phase 3: both
asserted equal per-person odds as fact, so leaving them behind would have
shipped a falsehood the moment a bowl switched to title-first. The TV screen
also draws, so it reads the bowl's method through `useTvBowlAccess` rather than
just naming it.

The check constraint allows only shipped methods. Adding `rotation` means
adding its value in the same migration that implements it, so a stored method
the client cannot honor never exists.

**Phase 2A — atomic server foundation.** *Shipped.* Adds the unfiltered history
index, factors event/watch-history persistence into a private helper, adds the
rotation RPC, guards the ordinary draw RPC on rotation bowls, and extends the
constraint/save RPC. The migration includes focused pgTAP coverage and a
rollback.

**Phase 2B — eligible-pool and client wiring.** *Shipped.* Extracts the reusable
pool resolver, adds the registry entry, and branches `useBowl.handleDraw` on
`selectionMode`. Both phone and TV draw through the same hook; there is no
parallel TV implementation.

**Phase 2C — truthful surfaces and cleanup.** *Shipped.* Adds the
settings/disclosure copy, replaces the TV label concatenation, removes the
unused `drawOdds` hook export, and updates README/TODO/design status.

Deploy the database migration before the frontend. A rollback must first map
any `rotation` bowls back to `person_first`, then restore the two-value
constraint and save RPC, drop the rotation RPC/private helper if unused, and
remove the new index. That behavior change should be called out in the rollback
file rather than hidden in a constraint failure.

### Implementation footprint

- Selection: `src/utils/drawSelection.js`,
  `src/utils/selectDrawCandidate.js`, and their focused tests.
- Method contract/copy: `src/utils/drawMethods.js` plus stat-line/modal registry
  tests.
- Shared phone/TV draw state: `src/hooks/useBowl.js` and
  `src/hooks/__tests__/useBowl.test.js`.
- Settings and TV surfaces: `src/screens/BowlSettings.jsx`,
  `src/tv/screens/TvTonightScreen.jsx`, and their integration tests.
- Database: one migration, one rollback, and one pgTAP file following the names
  above. Avoid a new table, a movie-rank column, or a second client-side history
  hook.

## Testing

Per `STABILITY.md`, this touches two high-risk areas (`useBowl.js`,
`BowlSettings.jsx`) plus migrations, so tests come with the change rather than
after it.

### JavaScript and UI

- Pool-resolver tests prove the returned ids are post-rating, post-genre,
  post-runtime, post-streaming-match, and post-service-rank. Preserve the
  no-service-match fallback, including custom/manual titles.
- Existing person-first/title-first suites remain unchanged as a regression
  gate. Omitting `drawMethod` must still reproduce person-first behavior.
- Registry tests recognize `rotation`, retain unknown-value fallback, require
  its copy/TV label, and mark it contributor-bucketed and server-selected.
- `useBowl` tests prove rotation sends exactly the resolved candidate ids to
  `draw_bowl_movie_by_rotation`, maps the returned id back from both raw and
  provider-wrapped candidates, skips provider lookup for custom titles, and
  keeps the ordinary RPC path for the existing methods.
- Error tests cover an empty resolved pool, a stale/no-longer-available pool,
  permission denial, missing migration, and the old-client refresh response.
- Bowl Settings integration covers owner save and member read-only display.
  Phone modal and TV tests cover the rotation disclosure/label and preserve the
  contributor-reach warning.

### Database

- Extend the existing draw-method pgTAP suite: owner can save `rotation`; member,
  outsider, anonymous, null, and unknown values retain their current outcomes.
- Prove a fresh three-contributor bowl draws each contributor once before any
  contributor repeats, with a second title for one contributor proving the
  fourth draw can return to a bucket only after the first cycle completes.
- Prove the oldest eligible contributor wins; a never-drawn contributor wins
  first; filtered-out contributors do not block; and a contributor becomes
  eligible again with their old history intact.
- Prove returned events and draws made under person-first/title-first still count
  toward rotation history.
- Cover registered users, case-insensitive named guests, and the unnamed
  `Link Guest` bucket so SQL and `getContributorBucketKey` cannot drift.
- Reject empty/oversized candidate arrays, a non-rotation bowl, and unauthorized
  callers. Prove wrong-bowl or already-drawn ids can never be selected, an
  all-stale pool returns a clear error, the ordinary RPC refuses a rotation bowl,
  and one successful call still writes one bowl event plus the same participant
  watch events as today.

Run `npm run test:run` and `npm run build`. Manual QA should switch an existing
bowl with history to rotation, verify a contributor with no prior draw goes
first, exercise a filter that removes the otherwise-next contributor, return a
movie and confirm that does not reset the turn, draw once from TV, and try two
near-simultaneous authorized browsers to confirm the bowl-row lock prevents a
double turn.

## Risks

- **Two concurrent draws violate the turn order.** Serialize rotation draws on
  the bowl row and select/persist inside the same RPC transaction.
- **Old clients silently fall back to person-first.** Make the ordinary draw RPC
  reject rotation bowls and show a refresh message; deploy the migration before
  exposing the option.
- **Client and SQL bucket identities drift.** Lock the registered, named-guest,
  and unnamed-guest cases in both JS and pgTAP tests.
- **Selection pipeline duplication changes filter/provider behavior.** Extract
  one eligible-pool resolver and retain the existing focused streaming/manual
  fallback tests.
- **History scans grow with a long-lived bowl.** Use the unfiltered bowl/time
  index and aggregate only the contributor buckets present in the candidate
  list; never send the event history to the client.
- **Event persistence forks into two implementations.** Put the immutable bowl
  event and participant-watch writes behind one private database helper called
  by both public draw RPCs.
- **Method proliferation.** Three named methods is a real settings decision for
  an owner to make; more than that becomes a menu nobody reads. Additional
  methods should have to displace an existing one.

## Recorded Idea: Within-Person Title Weights

Status: idea, not part of the phases above. A smaller first step — pinning one
title rather than weighting all of them — shipped first and is documented in
`output/designs/pinned-movie.md`. The open questions below stay open; the pin
answers only "this one."

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

Person-first is already two steps: pick a bucket, then `pickRandom(bucket)`.
Weights would replace only the second step and leave bucket selection untouched.
Rotation has the same conceptual second step, but its authoritative selection is
server-side; supporting weights there would require the rotation RPC to read and
apply the weight as well as the client-side person-first method. That is another
reason weights should not hitch a ride on the rotation migration.

### It only means something under contributor-bucketed methods

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
- **Link-guest rows.** Public add-link titles have no authenticated `added_by`,
  so there is no obvious person who owns their weight. Leave them at the default
  unless a separate guest-ownership model is designed.
- **Disclosure copy.** "Then selects one of their movies at random" stops being
  true and becomes "weighted by that person's preferences." Update the method
  registry copy so every existing surface changes together.

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

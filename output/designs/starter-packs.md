# Starter Packs

Status: idea, recorded for later. Nothing here is implemented and nothing is
scheduled. The fairness decision in "The Pack Is a Contributor" is settled
enough to build against; the sizing rule is a strong recommendation with one
unresolved question; everything under "Open Questions" is genuinely open.

## Product Idea

A new bowl is empty, and an empty bowl cannot draw. The first night is the one
most likely to decide whether a group keeps using the app at all, and right now
it costs six people six searches before anything can happen.

A **starter pack** is a named, curated list of titles a bowl owner can pour in
at once — "Under 100 Minutes", "October Horror", "Best Picture Winners". The
pack enters the bowl as a contributor in its own right, holds one contributor's
share of the odds no matter how many titles it carries, and can be removed as a
unit if the group decides it does not want it.

It is a **cold-start feature, not a catalogue feature**. The bowl's value comes
from people putting titles in it and from the comment revealed when one is
drawn. A pack has neither. It exists to get a bowl to its first draw, and its
design should make it easy for the pack to fade as real contributions arrive.

## Why the Schema Already Fits

`getContributorBucketKey` (`src/utils/drawBuckets.js:25`) buckets by `added_by`,
falling back to `guest:<lowercased added_by_name>` when the row has no
authenticated contributor. Public add links already use that path: a row with
`added_by` null and `added_by_name` set is a first-class contributor bucket
today, with no new column and no change to the draw.

That is the whole feature's foundation. A pack is a row shaped like a link
guest, named for the list instead of a person.

The history split carries it for free. `bowl_draw_events` and
`user_watch_events` both store `added_by_name`
(`20260724123000_add_durable_watch_history.sql:13`, `:163`), so a pack pick is
attributed correctly in bowl activity and in personal history without touching
either table. `note` (`20260822120000_add_movie_comments.sql`) is nullable, and
`update_own_bowl_movie_note` already refuses link-attributed rows — which is the
behavior a pack wants anyway, since nobody should be editing the pack's notes.

## The Pack Is a Contributor

**Decided: a pack is attributed to itself, never to the member who installed
it.** This is the single decision the feature stands on.

Attribute a hundred pack titles to the installing member and three things break
at once:

- **`title_first` bowls become the pack's bowl.** A flat raffle over 106 titles
  where 100 are the pack means the group's own picks lose six nights out of
  seven.
- **Rotation eats the installer's turn.** On their turn, the member's three
  deliberate picks compete with a hundred pack slips. Their own titles
  effectively stop coming up — the exact failure the person-first promise
  exists to prevent, arriving through the back door.
- **The odds panel lies.** `buildDrawOddsStats` would report one contributor
  holding a normal share, which is true of the bucket and false of the person.

As its own bucket the pack holds exactly `1/N` under person-first, the same as
any member, and adding more titles to a pack changes what it might play, not how
often it plays. That is the stated product promise applied unchanged to a
non-human contributor, and it means the pack cannot drown the room no matter how
large the underlying list is.

One collision to handle: the bucket key is `guest:<lowercased name>`, so a pack
named "October Horror" and a link guest who types "october horror" would merge
into one bucket. Namespacing pack rows (`pack:<slug>` rather than reusing the
guest prefix) is the clean fix, but it is a change to a function on the draw
path and wants its own test. Alternatively, reject a pack install whose name
collides with an existing contributor name in that bowl.

## Sample, Don't Dump

**Recommended: a pack install adds 8–10 titles drawn at random from the list,
with a "pull more from this pack" action available later.** The pack is a
*source*; what lands in the bowl is a sample of it.

The case against dumping the full list:

- `MAX_UNDRAWN_MOVIES_PER_BOWL` is 500. Two hundred-title packs is 40% of a
  bowl's capacity, permanently, mostly undrawn.
- `output/designs/future-ideas.md` §6 — "the 80-movie problem" — describes a
  bowl too big to hold in your head as the cost of *success*. A dumping pack
  manufactures that problem on day one, before the bowl has earned it.
- Every pack title is a real TMDB id, so it is lookup-eligible. It seeds
  `tmdb_filter_metadata` through the trigger on `bowl_active_tmdb_movies`, it
  enters the daily refresh queue, and it counts toward the large-bowl
  eligible-count problem already recorded in `TODO.md`.
- The daily cron budget is fixed: `FILTER_METADATA_DAILY_MAX_TITLES = 300`,
  twelve per batch, inside Vercel Hobby's 60-second cap. That budget is spent on
  **distinct titles globally**, so two hundred new ones lengthen the refresh
  cycle for every bowl in the system, not just the one that installed the pack.

Sampling also makes the pack repeatable rather than final. A bowl that finishes
its ten pulls another ten, and a pack the group dislikes has cost them ten slips
rather than a hundred.

The unresolved part is *refill*: whether pulling more is a manual action or
whether the pack automatically tops itself back up to N as its titles are drawn.
Automatic refill is the better product — the pack behaves like a contributor who
keeps showing up — but it needs a rule for what happens when the underlying list
is exhausted, and it puts an insert on the draw path, which is the most
sensitive code in the repo. Start manual.

## Cost: The Warm Path Is the Landmine

`src/lib/addBowlMovie.js:96-99` fires two warms per added title:
`fetchProviderLinks` (Watchmode) and `warmTmdbMovieFilterMetadata` (TMDB).

The Watchmode budget is `PROVIDER_LINKS_MONTHLY_BUDGET`, default 500
(`api/_lib/lookupProviderLinks.js:8`), reserved atomically in
`title_provider_link_usage` before any HTTP call and counting failures. That 500
is ours, but it is not conservative: a TMDB-id lookup costs two credits and the
free non-commercial plan allows 1,000 per month, so the default sits exactly at
the vendor ceiling. There is no headroom to raise it without a paid tier.

**A pack install must not go through the warm path.** Public add links already
skip it; pack inserts take the same rule. The rows land, the daily cron picks
them up in the background, and a draw warms what it needs when it needs it —
which is the only moment provider data actually matters.

Without that rule, a ten-title sample spends 2% of the monthly budget per
install and a hundred-title dump spends 20%, for titles nobody has chosen to
watch yet. Provider lookups are currently disabled by default
(`PROVIDER_LINKS_ENABLED`), so the bill would not arrive until the flag is
flipped — which makes it a worse bug, not a smaller one.

## Where Packs Actually Help the Caches

Both server-side caches are keyed `(tmdb_id, region)` — global, not per bowl and
not per user (`20260828120000_add_tmdb_filter_metadata_cache.sql:20`,
`20260830120000_add_title_provider_links.sql:13`). Two bowls holding the same
title share one lookup.

So a **small, fixed, reused** pack catalogue is the best-case shape for those
caches: once a few hundred canonical ids are warm, the tenth bowl to install a
pack adds no new rows at all. This is a real argument, and it points the same
direction as the fairness argument and the sizing argument — few packs, small
packs, fixed ids.

Two honest limits on it:

- The saving scales with overlap (draws ÷ distinct titles), and at this app's
  current size a pack raises the denominator immediately while the numerator
  waits on users who do not exist yet. Cache relief is a reason to build packs a
  particular *way*; it is not a reason to build them.
- `title_provider_links` rows are deleted at `now() - interval '29 days'` to
  stay inside the vendor's 30-day retention limit
  (`20260830120000_...sql:137`). A shared title costs roughly twelve lookups a
  year regardless of how many bowls hold it. The cache dedupes across bowls, not
  across time.

This also argues against generated or personalized packs of any kind, which
would mint distinct titles indefinitely — consistent with the "no
recommendations" line in `future-ideas.md`.

## Which Packs

Pick packs by finish rate, not by prestige.

Best Picture winners, AFI 100, and the NYT list are *homework*: high acclaim,
low completion, and exactly the titles that sit undrawn for a year and become
§6's tail. They are the packs to build last, if at all, and they are worth
offering mainly because some people genuinely enjoy checking a canonical list
off — a real audience, just not the one the bowl is shaped for.

The packs a group plausibly gets through are constraint-shaped:

- **Under 100 Minutes** — pairs with the runtime filter and answers the most
  common real objection on a weeknight.
- **October Horror** / seasonal — episodic, and a natural fit for install-then-
  remove.
- **90s Comfort** — high recognition, low resistance.
- **Everyone's Seen These But You** — the canonical-gap idea without the
  homework framing.

The list is deliberately static. Best Picture changes once a year; nothing here
needs to be live.

## Sourcing

A static JSON of TMDB ids checked into the repo, generated by a script in the
shape of `scripts/refresh-provider-logos.mjs`.

- No new serverless function. The deployment is at Vercel Hobby's 12-function
  limit, and the two existing overflow handlers already share
  `api/movie-cache.js`.
- No runtime TMDB quota, and no dependency on TMDB list availability.
- The pack file holds ids plus a title for display. Poster and metadata still
  resolve through the normal cached paths, which keeps the repo clear of TMDB's
  six-month content-caching cap — the constraint that puts a refresh date on
  `providerLogos.js`. Worth confirming against the current terms before
  committing a file with titles in it.

Custom-title rules do not apply: pack titles are real TMDB ids, so the
`Number(tmdb_id) > 0` guard passes and the negative synthetic id convention is
untouched.

## The Write Path

RLS blocks the client from doing this directly. `bowl_movies_insert_own_undrawn`
requires `added_by = auth.uid()` **and** `added_by_name is null`
(`20260726153000_tighten_profile_and_bowl_movie_access.sql:53-67`), which is
precisely the row shape a pack needs to violate. Public adds get around it
through `consume_bowl_add_link`, a `SECURITY DEFINER` function.

A pack install needs the same treatment: one RPC, `install_bowl_starter_pack`,
that in a single transaction

1. verifies the caller owns the bowl,
2. rejects ids already active in that bowl (`bowl_active_tmdb_movies` is the
   registry, and the duplicate trigger will reject them anyway — better a clean
   skip than a failed batch),
3. enforces `MAX_UNDRAWN_MOVIES_PER_BOWL` against the *resulting* count, not the
   starting one,
4. inserts the sampled rows with `added_by` null and the pack's name in
   `added_by_name`,
5. returns what it inserted and what it skipped, so the client can say "added 8
   of 10 — two were already in the bowl."

Removal is the mirror: `remove_bowl_starter_pack` deletes the pack's *undrawn*
rows only. Drawn ones are history and are not the pack's to take back.

Per `CLAUDE.md`, both are permission-sensitive and need pgTAP coverage in
`supabase/tests/` plus a revert in `supabase/rollback/`: owner vs member,
authenticated vs anonymous, limit-exhausted, duplicate-collision, and removal
leaving drawn rows intact.

## Surfaces

- **Bowl Settings**, owner-only: a Starter Packs section listing available
  packs, each with install, "pull more", and remove. This is the natural home —
  it already owns draw access, draw method, and the member roster.
- **Empty bowl state** on the dashboard: the one place a pack should be
  *offered* rather than found. A bowl with zero undrawn titles cannot draw, and
  that is the moment the feature is for.
- **The reveal.** A pack pick has no person and no comment. It needs its own
  line — the pack's name where a contributor's name goes — or the reveal reads
  as broken data. `getMovieAttributionLabel` already returns `added_by_name`
  first, so the phone strip and `TvTonightScreen` inherit correct behavior; what
  needs deciding is the copy, not the plumbing.
- **The odds panel** should name the pack as a contributor without dressing it
  up as a person.

## Open Questions

1. **Does a pack take a turn in rotation?** Treating it as a contributor is
   consistent, but it means every Nth night is a pack night regardless of what
   the group added. Excluding packs from rotation while allowing them in
   person-first and `title_first` is equally defensible and probably kinder to a
   bowl that has outgrown its starter phase. This needs answering before any
   code, because rotation is serialized in the database and the answer lives in
   `draw_bowl_movie_by_rotation`.
2. **Can a member remove a pack, or only the owner?** Installing is clearly the
   owner's call. Removal is closer to a group decision, and §6's rule — only the
   contributor may retire their own titles — has no answer for a contributor who
   is not a person.
3. **Does the pack fade?** An option to auto-remove the pack's undrawn titles
   once the bowl has N real contributions would make "starter" literal. It also
   deletes things behind people's backs, which the product otherwise never does.
4. **Refill: manual or automatic** (see "Sample, Don't Dump").
5. **Bucket namespacing vs. name-collision rejection** (see "The Pack Is a
   Contributor").
6. **Is the reveal actually acceptable?** The strongest objection to this whole
   feature is that a pack pick is a thinner version of the product every time it
   lands — "here is a movie" instead of "Dave picked this for you." Worth
   installing one pack in a real bowl and living with a few draws before
   building the rest.

## Sketch of the Work

1. `scripts/build-starter-packs.mjs` and a checked-in pack file. Cheap, and it
   settles the sourcing question before any product code exists.
2. The two RPCs and their pgTAP suites.
3. The Bowl Settings section and the empty-bowl offer.
4. Reveal and odds-panel copy.
5. Rotation behavior, once question 1 is answered.

Steps 1 and 2 are independently useful and testable; nothing before step 3 is
visible to anyone.

## Deliberately Not In Scope

- **Generated, personalized, or taste-derived packs.** Ruled out by
  `future-ideas.md` and by the cache reasoning above — both arrive at the same
  place from different directions.
- **Importing a person's external list** (Letterboxd and friends). That is a
  contributor feature wearing a pack's clothes, and it deserves its own design.
- **Browsing a pack's contents inside the bowl.** The bowl hides what is in it
  on purpose. A pack the group can read through is a browse-and-pick list, which
  is the failure mode the whole product is arranged to avoid.

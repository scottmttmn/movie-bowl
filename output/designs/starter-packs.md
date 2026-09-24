# Starter Packs

Status: design settled September 23, 2026; in progress. Steps 1 and 2 of
"Sketch of the Work" are built -- the pack definitions and Best Picture list in
`src/utils/starterPacks.js`, the live resolver at
`/api/starter-packs/candidates`, and the schema, install / remove / claim
functions and rotation change in
`supabase/migrations/20260924120000_add_starter_packs.sql` -- and nothing a
person can see exists yet. The behavior below is decided, and the open questions the first
draft carried are closed except the one under "Still Open": whether the reveal
holds up in a real bowl.

## Product Idea

A new bowl is empty, and an empty bowl cannot draw. The first night is the one
most likely to decide whether a group keeps using the app at all, and right now
it costs six people six searches before anything can happen.

A **starter pack** is a named, curated list of titles a bowl owner can pour in
at once -- "Spielberg: The '80s", "Best Picture Winners: The '90s". The pack's
titles belong to nobody in particular: they are **shared slips, in every
person's pile**. They never take a turn of their own, and they thin out as the
group adds and claims its own picks.

It is a **cold-start feature, not a catalogue feature**. The bowl's value comes
from people putting titles in it and from the comment revealed when one is
drawn. A pack has neither. It exists to get a bowl to its first draw, and its
design should make it easy for the pack to fade as real contributions arrive.

## What the Schema Already Gives Us

`bowl_draw_events` and `user_watch_events` both store `added_by_name`
(`20260724123000_add_durable_watch_history.sql:13`, `:163`), so a pack pick is
attributed correctly in bowl activity and in personal history without touching
either table's history logic. `note`
(`20260822120000_add_movie_comments.sql`) is nullable, and
`update_own_bowl_movie_note` already refuses rows with no `added_by` -- which
is the behavior a pack wants, since nobody should be editing the pack's notes.

It also has nowhere to say which pack a bowl has installed. Slips cannot answer
that: removal keeps drawn ones and claiming converts undrawn ones, so a
marker on the rows is either stale after removal or gone once the last slip is
drawn. The installation is therefore its own state, on the bowl: nullable
`bowls.starter_pack` (the slug) and `starter_pack_installed_at`, set by install
and cleared by removal. The one-pack rule, "pull more", and "this pack has
nothing left" all read it.

What it does not give us is a way to tell a pack row from a link guest's. Both
have `added_by` null and a name in `added_by_name`, and
`getContributorBucketKey` (`src/utils/drawBuckets.js`) would put either into a
`guest:<name>` bucket. A pack must not be a bucket at all (below), so pack rows
carry an explicit marker: a nullable `starter_pack` column holding the pack's
slug on `bowl_movies`, snapshotted onto `bowl_draw_events` like every other
movie field. The bucket code checks the marker, never the name, so a link
guest who types a pack's name cannot collide with it.

## The Pack Is Shared, Not a Contributor

**Decided: a pack's titles are in every person's pile.** Under person-first the
draw picks a person uniformly, then a title from that person's own titles plus
all of the pack's. Rotation picks the person by its usual history rule, then
the title the same way. `title_first` is one pile containing everything, so the
same rule makes a pack title behave exactly like any other title there. One
rule, three methods, no special case.

**The pack never takes a turn.** There is no pack bucket, so there is no pack
night in rotation and no `1/N` share for a non-person under person-first. The
first draft's open question about rotation turns does not arise.

**It fades on its own.** A person with *k* eligible titles, in a bowl whose pack
has *P* eligible titles, draws a pack title on their turn with probability
`P / (k + P)`. With the cap below at 15, someone with 5 of their own is 75% pack
and someone with 30 is a third; every add moves it, and nothing deletes behind
anyone's back.

**When nobody has an eligible title, the pack is the draw.** Buckets come from
the people who own titles in the eligible pool, so a bowl holding only its pack
-- or one whose members' titles the filters have all excluded -- has no pile for
the pack to join. That case is defined, not left to fall out: the draw is a flat
pick over the eligible pack titles, under every method, and in rotation it
spends nobody's turn (`turn_bucket_key` stays null). The first night therefore
draws from the pack, which is the moment the feature is for.

The trade is explicit: a light contributor's own title is diluted on their own
turn. That is accepted because the pinned movie already answers it -- a pinned
title goes first in its owner's pile, ahead of the pack -- and because claiming
(below) turns a wanted pack title into your own.

**Never attributed to the member who installed it.** Attributing pack titles to
the installer would drown that member's own picks on their turn, make rotation
spend their turn on a list they did not choose, and credit them on the reveal
for a pick they never made. Pack rows keep `added_by` null and the pack's name in
`added_by_name`, with `starter_pack` set.

### Claiming a pack title

A bowl holds one active copy of a title (`bowl_active_tmdb_movies`), so without
a rule a member who genuinely wants a pack title would be told it is already in
the bowl and could never pin it. **Adding a title that is an undrawn pack slip
claims it**: the slip becomes the member's -- `added_by` set, `starter_pack`
cleared -- keeping the one active copy. From then on it is an ordinary title of
theirs, pinnable, and out of the shared pile. The confirmation has to say so,
because the bowl's count does not move: "Added *Halloween* -- it was in the
Spielberg: The '80s pack, now it's yours."

**Pack titles cannot be pinned directly.** A pin puts one of *your* titles
first in *your* pile; a shared slip is in every pile and belongs to no one, so
pinning it would need its own rules for whose pile it leads and what two pins on
one slip mean. Claiming covers the want: add it, then pin it. The bowl never
shows the pack's contents, so claiming is always an Add, never a browse.

### Rotation must record whose turn it was

`draw_bowl_movie_by_rotation` decides whose turn is next from the bucket of each
past draw's movie (`history_by_bucket`). A pack title drawn on Anna's turn has
no person on it, so Anna would still look never-drawn and be chosen again --
and the pack could keep winning her pile. The draw event therefore records the
bucket whose turn it was, in a nullable `turn_bucket_key` column written by the
rotation RPC, and the history reads `coalesce(turn_bucket_key, <derived key>)`.
Person-first keeps no history of its own, but a bowl can switch to rotation
later, so a person-first draw of a pack title records the bucket too, through an
optional parameter on `draw_bowl_movie`. `title_first` has no turns to record. This is a change to the most
sensitive function in the repo, so it gets its own pgTAP cases: a pack win on a
turn still spends that turn, and the next draw goes to the next person.

## Sample, Don't Dump -- and One Pack at a Time

**Decided: a bowl holds at most one installed pack, and at most 15 undrawn
titles from it, whichever limit binds first.** Installing samples up to 15
titles at random from the pack's list; "pull more" tops the bowl back up to 15
from what remains; refill is manual, never on the draw path. A second pack can
only be installed after the first is removed.

Under the shared rule the pack's pull grows with its size, so the cap is what
keeps a pack a starter rather than the bowl. It also keeps the costs below
small:

- `MAX_UNDRAWN_MOVIES_PER_BOWL` is 500; fifteen slips is 3% of it.
- `output/designs/future-ideas.md` §6 -- "the 80-movie problem" -- describes a
  bowl too big to hold in your head as the cost of *success*. A dumping pack
  manufactures that problem on day one.
- Every pack title is a real TMDB id, so it seeds `tmdb_filter_metadata`
  through the trigger on `bowl_active_tmdb_movies` and enters the daily refresh
  queue, whose `FILTER_METADATA_DAILY_MAX_TITLES = 300` is spent on distinct
  titles globally. Fifteen per bowl, from a small fixed catalogue, is the shape
  that cache handles well (see "Where Packs Actually Help the Caches").

A pack whose list is used up simply has nothing more to pull; "pull more" says
so.

## Two Vendors, Two Quotas

These are separate pools and neither draws on the other. Both are called
"providers" in this codebase, which is the confusion worth heading off before
anyone reads the cost sections below and adds the numbers together.

| | Vendor | Answers | Feeds | Ceiling |
| --- | --- | --- | --- | --- |
| `tmdb_filter_metadata` | TMDB | *Which services carry this?* | Streaming filters, `prioritizeByServiceRank`, eligible counts | 300 titles/day, self-imposed to fit the cron's 60-second cap |
| `title_provider_links` | Watchmode | *What is the URL to play it there?* | The "Open [service]" handoff on TV and phone | 500 requests/UTC month, self-imposed at the free plan's 1,000 credits |

The cron touches TMDB only — `fetchTmdbFilterMetadata` makes one
`/movie/{id}?append_to_response=release_dates,watch/providers` call per title
(`api/_lib/tmdbFilterMetadata.js:27`) and never imports Watchmode. Watchmode is
spent solely by `lookupProviderLinks` on an add or a draw.

Two details shape what a pack title will look like to the filters. TMDB's
`flatrate` and `ads` entries are kept and rent/buy are discarded
(`tmdbFilterMetadata.js:10-12`), so a rental-only title reads as streaming
nowhere. And service names are normalized against the fixed allowlist in
`src/utils/streamingServices.js`; anything off that list is dropped entirely. A
pack heavy on niche or rental-only titles will therefore look emptier to the
streaming filters than its size suggests — worth weighing when choosing lists.

Provider *logos* are a third source and cost nothing at runtime: TMDB again, but
resolved offline into `src/utils/providerLogos.js` by
`scripts/refresh-provider-logos.mjs`.

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

Without that rule, a fifteen-title sample spends 3% of the monthly budget per
install -- and again on every "pull more" -- for titles nobody has chosen to
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

**Decided for the first version: filmographies split by decade, and Best
Picture winners by decade** -- "Spielberg: The '80s", "Best Picture Winners: The
'90s". A decade of one director's or actor's work is usually 5-15 films, close
to the cap, and the decade reads naturally in the pack's name and on the reveal.

The first draft argued for picking packs by finish rate rather than prestige:
canonical lists are homework, admired more than finished, and the titles most
likely to sit undrawn. That caveat stands and is the reason the cap and sampling
matter; it did not outweigh a catalogue people recognise at a glance. Worth
watching once packs exist: whether Best Picture slips get put back more often
than filmography ones.

The list is deliberately static. Best Picture changes once a year; nothing here
needs to be live.

## Sourcing

**Decided September 23, 2026: nothing derived from TMDB is committed to this
repository.** TMDB's API Terms of Use (last updated October 20, 2023) define
TMDB Content as "any content ... or other information available through, on,
or from the TMDB APIs" (§1.A), forbid caching "for longer than 6 months, any
information obtained through or from TMDB" (§1.C), and forbid making
derivatives of TMDB Content (§1.C). A checked-in list of TMDB ids -- or a
migration seeding them -- is information from TMDB kept with no expiry, and in a
public repository it is a published dataset anyone can copy. So the repository
holds only what is ours, and TMDB is asked at run time.

- **Committed: pack definitions, in our own terms.** A small file in the repo
  names each pack and states its rule, not its contents: for a filmography, the
  person's name, the role (directing or principal cast) and the decade; for Best
  Picture, the decade. Nothing in it came from TMDB.
- **Committed: the Best Picture winners, as title and year.** TMDB carries no
  awards data, and this is the Academy's public record written down by us, not
  TMDB Content.
- **Resolved live, never stored.** When the owner installs a pack or pulls
  more, a server route asks TMDB for that pack's candidates there and then:
  person credits for a filmography, keeping feature films where the person
  directed or had a principal role and dropping entries under a minimum vote
  count -- otherwise cameos, uncredited parts, TV movies, documentaries and
  shorts fill the pack -- then the requested decade; a title-and-year match for
  each Best Picture winner. Anything ambiguous (two people with one name, two
  films with one title in one year) fails that pack loudly rather than
  guessing. The route is rewritten onto `api/movie-cache.js` like the existing
  overflow handlers, because the deployment is at Vercel Hobby's 12-function
  limit.
- **Nothing curated persists.** The candidate list lives for one request. The
  client samples from it, fetches each chosen movie through the normal
  `/api/tmdb` details path, and installs those as ordinary bowl rows -- the same
  thing an owner adding fifteen movies by hand would leave behind. There is no
  stored pack catalogue to age out or to count as a derivative list.
- **Not a derivative, decided September 23, 2026.** §1.C also forbids
  derivatives of TMDB Content without defining them, and a named selection
  looked closer to that edge than a search. On inspection it is not: a
  filmography pack is one person's movie credits, narrowed by role, decade and
  a minimum vote count -- the same read of the same endpoint the person search
  planned in `search-revamp.md` makes, and not something Discover can do
  alone, since its `with_crew` does not check the job -- and a Best Picture
  pack is our own list matched title by title the way someone typing it into
  search would. What a bowl keeps is the same rows
  an owner adding those movies by hand would leave, and a bowl assembled by
  hand is plainly ordinary use. Movie Bowl is also non-commercial.

  **TMDB confirmed it the same day.** Asked on its forum with the mechanics
  above -- rules only, candidates resolved live, up to 15 sampled, nothing
  about the pack stored, saved titles refreshed or cleared within six months --
  Travis Bell (TMDB staff) answered that it "would not count as derivative", on
  the one condition that TMDB is attributed as the source of the data
  ([thread](https://www.themoviedb.org/talk/6ab4235b84936b9228c59b1c?page=1#6ab427cd2be204ec24044fe7)).
  The ruling covers those mechanics and no others, so a change that stores a
  resolved pack reopens it. Attribution is already on the About page; the pack
  surfaces in Bowl Settings should also name TMDB as where the titles come
  from.

Custom-title rules do not apply: pack titles are real TMDB ids, so the
`Number(tmdb_id) > 0` guard passes and the negative synthetic id convention is
untouched.

## The Write Path

RLS blocks the client from doing this directly. `bowl_movies_insert_own_undrawn`
requires `added_by = auth.uid()` **and** `added_by_name is null`
(`20260726153000_tighten_profile_and_bowl_movie_access.sql:53-67`), which is
precisely the row shape a pack needs to violate. Public adds get around it
through `consume_bowl_add_link`, a `SECURITY DEFINER` function, and packs take
the same route.

`install_bowl_starter_pack(p_bowl_id, p_pack_slug, p_pack_name, p_movies)`
takes the pack's display name -- the database keeps no pack names either -- and
the movie snapshots to insert, the way `consume_bowl_add_link` takes `p_movie`:
`bowl_movies.title` is not null and the database holds no titles, so the client
resolves each sampled id through the normal `/api/tmdb` details path first. In
one transaction it:

1. verifies the caller owns the bowl;
2. refuses if `bowls.starter_pack` names a different pack (one pack at a time),
   and sets it when it is empty;
3. skips ids already active in the bowl -- a clean skip rather than a failed
   batch -- and inserts only up to 15 undrawn pack rows in total, and within
   `MAX_UNDRAWN_MOVIES_PER_BOWL`, counted against the *resulting* totals;
4. inserts the rows with `added_by` null, the pack's name in `added_by_name`
   and its slug in `starter_pack`;
5. returns what it inserted and what it skipped, so the client can say "added
   13 of 15 -- two were already in the bowl."

"Pull more" is the same function called again for the installed pack. The
client samples which ids to offer; the database enforces every limit.

**The database does not check that an id belongs to the pack.** Doing that
needs a stored list of each pack's contents, which is exactly what the sourcing
rules avoid. The exposure is small and bounded: only the bowl's owner can call
the function, the rows land only in their own bowl, the 15-slip cap and the bowl
limit still hold, and every row still has to be a real title an ordinary add
could have inserted. The worst case is an owner labelling up to fifteen movies
of their choosing as a pack in their own bowl.

`remove_bowl_starter_pack(p_bowl_id)` deletes the pack's *undrawn* rows and
clears `bowls.starter_pack`, owner-only. Drawn ones are history, and claimed ones
are no longer the pack's; neither keeps a pack installed.

**Claiming** goes through the add path, server-side: when a member adds a title
that is an undrawn pack slip in that bowl, the slip is converted in place --
`added_by` set to the member, `added_by_name` and `starter_pack` cleared --
rather than inserting a second copy. This needs a `SECURITY DEFINER` path of its
own, because the client cannot update a row it did not create.

**Neither install nor claim goes through the warm path** (see "Cost").

Per `CLAUDE.md`, all of this is permission-sensitive and needs pgTAP coverage in
`supabase/tests/` plus a revert in `supabase/rollback/`: owner vs member vs
outsider vs anonymous; a second pack refused; the 15 cap and the bowl limit;
duplicate collision; removal leaving drawn
and claimed rows intact and clearing the installation, so a second pack can then
be installed; a bowl whose last pack slip was drawn still reporting its pack;
a pack-only bowl drawing without spending anyone's turn; a claim
converting the slip without a second copy; and the rotation turn cases above.

## Surfaces

- **Bowl Settings**, owner-only: a Starter Packs section listing the available
  packs, with install when none is installed, and "pull more" and remove for
  the installed one. This is the natural home -- it already owns draw access,
  draw method, and the member roster. Members see which pack is installed but no
  controls.
- **Empty bowl state** on the dashboard: the one place a pack is *offered*
  rather than found, and to the owner only.
- **The reveal.** A pack pick has no person and no comment, so the pack's name
  goes where a contributor's would: "From the Spielberg: The '80s pack."
  `getMovieAttributionLabel` already returns `added_by_name` first, so the phone
  strip and `TvTonightScreen` inherit it; the copy is what needs writing.
- **Add confirmation** when an add claims a pack slip, as above.
- **Nothing browses the pack.** Pack titles do not appear in anyone's own list,
  and the bowl does not show the pack's contents.

## Decided September 23, 2026

1. **Rotation turns:** the pack never takes one; its titles live inside each
   person's turn, and the draw records whose turn it was.
2. **Who installs and removes:** the owner only. Anyone can claim a title out
   of the pack by adding it.
3. **Fading:** natural -- claims, draws and new adds thin it. Nothing is ever
   removed automatically.
4. **Refill:** manual, up to the cap.
5. **Bucket collision:** moot. Pack rows are marked by `starter_pack`, not by
   name, and are not a bucket.

## Still Open

- **Is the reveal actually acceptable?** The strongest objection to this whole
  feature is that a pack pick is a thinner version of the product every time it
  lands -- "here is a movie" instead of "Dave picked this for you." Worth
  installing one pack in a real bowl and living with a few draws before
  building the rest.

## Sketch of the Work

1. The committed pack definitions and Best Picture list, and the live
   resolver route behind `api/movie-cache.js`. Cheap, and it settles sourcing
   before any product code exists.
2. The `bowls.starter_pack` installation state, the
   `starter_pack` and `turn_bucket_key` columns, the install / remove / claim
   functions, the rotation change, and their pgTAP suites and rollbacks.
3. The client draw: pack rows join every bucket in person-first, the pin still
   leads its owner's pile, and eligibility readouts count them the same way
   through `getStreamingPriorityPool`.
4. The Bowl Settings section, the empty-bowl offer, and the reveal and claim
   copy.

Steps 1 and 2 are independently useful and testable; nothing before step 4 is
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

# Provider Deep Links

Status: **implemented; disabled by default pending configuration and deployment.**

Implementation verified on August 30, 2026, including a successful live US
lookup of Arrival with the configured key. The design below remains the
behavioral reference, with these vendor-driven corrections:

- Watchmode accepts `GET /v1/title/movie-<tmdbId>/sources/?regions=US` and
  `X-API-Key` authentication. A TMDB lookup is one HTTP request but two quota
  credits; the default 500-request budget allows at most 1,000 credits.
- Native iOS/Android links require a paid Watchmode plan. They are optional in
  the stored shape; web title links work with the intended free setup.
- The free plan requires linked attribution on screens using its data and
  deletion/refresh within 30 days. Direct links have attribution. The existing
  daily filter-metadata job deletes rows at 29 days, even with lookups off;
  lookup-time and browser expiration refuse older data. This is retention
  cleanup only, not pre-warming, and spends no vendor requests.
- The begin RPC takes an additional server-supplied `p_monthly_budget` argument.
  Browser caching is scoped by account, bowl, and title. Lookups start during
  the reveal animation through `useDrawProviderLinks`; restored TV results use
  the same path. Native app behavior is unchanged.

Activation and cancellation cleanup are documented under “Provider title
links” in `README.md`. Sources: [API docs](https://api.watchmode.com/docs/),
[plans](https://api.watchmode.com/), [terms](https://api.watchmode.com/tc).

This is Phase 2 of `tv-theater-mode.md` — "Real deep links and the voice card" —
written out far enough to build from. It replaces the provider *search* URL the
handoff opens today with a direct title URL, and adds the spoken assistant
command to the TV reveal. It ships on the web, benefits the phone as much as the
TV, and is the data dependency for phases 3 and 4.

## What exists today

`src/utils/webLaunch.js` holds a hardcoded map of eight services to search-URL
builders — `https://www.netflix.com/search?q=Arrival` and friends — and
`resolvePreferredWebLaunchCandidate` walks the user's saved service order,
returns the first service that also appears in the movie's TMDB providers, and
builds a search link for it.

Two surfaces consume it, and they differ in one way worth knowing before
changing either:

| Surface | Call site | Gated on |
| --- | --- | --- |
| Phone | `BowlDashboard.jsx:320`, rendered through `AddMovieModal` at `:1173` | `defaultDrawSettings.enablePreferredWebLaunch` |
| TV | `TvTonightScreen.jsx:788`, rendered at `:556` as "Open [service]" | nothing — always shown |

That is ladder step 3 in `tv-theater-mode.md`: the right app, the right query,
and a search results page the room still has to navigate. On a signed-in
browser a *title* URL effectively starts the movie instead, which is the whole
point of this phase.

TMDB tells us a title is on Netflix. It does not tell us where on Netflix.
Closing that gap needs a second data source.

## Vendor: Watchmode

Recommend **Watchmode**, wrapped in one module so the choice is reversible.

An earlier draft of this plan picked it on quota shape — a monthly bucket
absorbing bursts that a daily bucket rejects. Under the lookup-at-draw design
below that argument is dead: we spend on the order of ten requests a month, and
every candidate's free tier is enormous relative to that. What actually decides
it is the data. Watchmode takes a TMDB id directly (`movie-<tmdbId>`) and
returns per-source `web_url` alongside `ios_url` and `android_url`, and those
Android URLs are exactly what a Phase 4 `launchDeepLink(url)` bridge fires as an
ACTION_VIEW intent. A vendor that returns only web URLs would have to be
replaced before phase 4 rather than extended.

The endpoint and field names were confirmed against current documentation;
see the implementation notes above. `api/_lib/providerLinks.js` owns the
vendor-specific details.

Keep no payment card attached. The overrun failure mode must stay a 429, never
a bill.

## Storage: one lazily filled cache

An earlier draft of this plan pre-warmed every title in every bowl from a
nightly cron, with a claim queue, refresh tokens, seed and prune triggers, and a
budget split against the existing filter-metadata pass. All of that existed to
have a link ready for titles that might never be drawn. It is deleted.

**Look the title up when it is drawn, cache the answer, and stop there.** A
household draws a handful of times a month, so this is roughly ten vendor
requests a month against a free tier of thousands — a fraction of the pre-warm
design's spend, and a fraction of its moving parts.

The cache still earns its place, because the alternative to a table is calling
the vendor again for every member, every device, and every re-draw of the same
title. It just does not need a queue.

```sql
create table public.title_provider_links (
  tmdb_id bigint not null check (tmdb_id > 0),
  region text not null check (region ~ '^[A-Z]{2}$'),
  links jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  retry_after timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, region)
);
```

RLS on, all grants revoked from `public`/`anon`/`authenticated`, service role
only. `consecutive_failures` and `retry_after` survive the simplification
because without them a title the vendor does not know about spends a request on
every single draw, forever.

Rows are created on first lookup. There is no trigger on `bowl_movies`, no
backfill, and no bowl-membership lifecycle. The existing daily job deletes
successful cache rows at 29 days to satisfy the free plan's retention limit;
rows are recreated only when someone next adds or draws the title.

This also disposes of the bug the previous draft carried: pruning on
`bowl_active_tmdb_movies` would have deleted the links row for tonight's movie
during the draw that selected it, because `sync_bowl_active_tmdb_movies` drops a
title from the active registry the moment `drawn_at` is set
(`20260723200000_prevent_duplicate_active_movies.sql:80-91`). A cache keyed only
by TMDB id cannot have that class of bug, because it does not model bowl
membership at all.

`links` is a jsonb array of
`{ service, type, webUrl, iosUrl, androidUrl }`, with `service` already run
through `normalizeServiceName` so the stored names match
`AVAILABLE_STREAMING_SERVICES` and resolution is a plain comparison. It is
written whole and read whole and never queried by service, which is the same
reason `providers` is a `text[]` on the filter cache row rather than a child
table.

**Store every source type the vendor returns, including rent and buy. Filter at
resolution, not at write.** V1 only ever launches a `sub` or `free` source — the
saved service list is a list of subscriptions, and "Open Prime Video" must not
land someone on a $4.99 checkout page they did not ask for. But that is a
product judgment about tonight's handoff, not a judgment about the data, and the
two should not be welded together at the point of no return. One request already
returns every source for a title, so keeping them costs no quota and a few
hundred bytes, while re-deciding after dropping them would mean re-fetching at
full vendor cost. Keep them, and the decision stays a one-line change to the
resolver.

### Where the calls actually happen

The whole quota story in one pass through a title's life:

| Moment | Vendor calls |
| --- | --- |
| A signed-in member adds the movie | 1 |
| Someone adds it through a public add link | 0 — see below |
| Anyone opens its detail, sees providers, filters on it | 0 |
| It is drawn, and the add-time lookup landed | 0 — cache hit |
| It is drawn and no fresh row exists | 1 |
| The reveal, the TV handoff, other members opening the same draw | 0 |
| It is drawn again inside 30 days | 0 |
| It is drawn again after 30 days | 1 |
| Returned to the bowl, or deleted | 0 |

Custom titles never appear at all: they carry a negative synthetic `tmdb_id`,
the route rejects anything `<= 0`, and no row is ever created.

A household adding twenty titles and drawing eight times a month spends about
twenty-five requests. The free tier stopped being a design constraint the moment
the cron went away.

## Quota, enforced where it cannot drift

At ten requests a month the budget is insurance, not a working limit. Keep it
anyway — it is the thing standing between a bug in a retry path and a bill —
but keep it small.

```sql
create table public.title_provider_link_usage (
  usage_month date not null,
  region text not null,
  request_count integer not null default 0,
  primary key (usage_month, region)
);
```

The enforcement point is the RPC that opens a lookup, not the application:

`begin_title_provider_link_fetch(p_tmdb_id, p_region, p_bowl_id, p_user_id, p_monthly_budget)`
does everything that must be atomic, in this order — confirms the user shares a
bowl with the title, returns the cached row when it is fresh, refuses when
`retry_after` has not passed, refuses when the month's `request_count` has hit
the budget, and otherwise increments the counter and tells the caller to fetch.
The counter moves before the request goes out, so a crash mid-request leaves the
count matching what the vendor saw. `complete_title_provider_link_fetch` and
`fail_title_provider_link_fetch` write the result or the backoff.

Two members drawing the same title in different bowls at the same instant both
get told to fetch, spend two requests, and write the same answer. A lock would
cost more than the request it saves.

Server-side controls, none of them ever a `VITE_` variable:

- `WATCHMODE_API_KEY` — absent means the feature is off, not broken.
- `PROVIDER_LINKS_ENABLED` — the kill switch.
- `PROVIDER_LINKS_MONTHLY_BUDGET` — default 500, two orders of magnitude above
  expected use and still well under the free tier.

## The lookup route

One route, and it is the only thing that talks to the vendor.

`api/provider-links/lookup.js`: POST only, `{ id, bowlId }`, bearer token,
`supabaseAdmin.auth.getUser`, then `begin_title_provider_link_fetch`. On a fresh
cache hit it returns the links without spending anything; on a miss it calls the
vendor, writes the row, and returns them; when the RPC refuses — not a member,
budget spent, backing off, kill switch — it returns what it has, which is
usually `{ links: [] }`. The client's behavior is identical in every case, so
the failure modes do not need to be distinguishable to it.

There is no separate Supabase read path. An earlier draft had a
`get_title_provider_links` RPC for reads and a serverless route for writes, but
with lookups happening only at draw time the two collapse into one call that
either spends or does not. One authorization check, one place to reason about.

`src/lib/providerLinks.js` wraps it with the ten-minute in-module TTL cache and
in-flight dedupe copied from `lib/streamingProviders.js`, exposes
`clearProviderLinksCache()` for tests, and returns `{ links: [] }` on any error.
Every failure in this feature is a fallback, never a message.

### Two call sites: add and draw

Call the same route twice in a title's life — once when a signed-in member adds
it, once when it is drawn — and let the freshness check make the second one free
whenever the first worked.

This is not the pre-warm returning under another name, and the difference is the
cost curve rather than the call count. The nightly pass re-fetched every title
every thirty days forever, so it scaled with catalog size times time and spent
most of its budget on titles nobody touched. An add-time lookup is one call per
title, once, at the moment a person typed it in: it scales with human effort,
and each title is paid for exactly once. Twenty adds a month is twenty requests.

What it buys is the tail. The draw-time lookup usually resolves inside the
reveal window (below), but "usually" is doing real work in that sentence — a
cold serverless function is the slow path, not the vendor. A title added last
week is already cached, so the draw is a hit and there is no window to lose.

Fire it from `useBowl.handleAddMovie`, unawaited, after the insert commits.
Nothing waits on it, and a failure leaves exactly the state we would have had
without it: no row, and a draw-time lookup later.

**Not from the public add-link path.** `/add-to-bowl/:token` renders outside
`RequireAuth` (`App.jsx:61`, `:261`) and `api/add-links/consume.js` runs on the
service role, so an add-time call there would let anyone holding a shared link
spend metered quota by adding titles. The monthly budget caps the damage, but
the right answer is not to open the tap: titles arriving through an add link get
looked up when they are drawn, by a member who is signed in.

One refinement deliberately skipped: the add modal already knows the movie's
TMDB providers, so it could skip the lookup for titles on no subscription
service at all. That is the pre-warm design's provider join in miniature, it
saves a handful of requests a month against a budget we are nowhere near, and it
adds a branch that has to stay correct. Call unconditionally.

### Timing: the reveal window pays for the lookup

When the add-time lookup has not happened — a title from an add link, or one
added before this shipped — the draw waits on a live vendor call. In practice it
does not wait at all, because the draw already spends longer than the lookup
does.

`runDraw` (`BowlDashboard.jsx:547-575`) resolves the draw RPC, then holds the
reveal behind `Promise.all([drawPromise, minAnimationDelay])` with a 1500 ms
floor, then awaits `buildDetailMovie`, which itself fetches TMDB details and
providers. Fire the lookup the moment `drawPromise` resolves — the title is
known there, well before anything renders — and it runs inside a window that is
at minimum a second and a half wide. The common case is that the link is ready
before first paint.

On TV the margin is larger still: with theater mode on, several minutes of
pre-roll separate the draw from the handoff.

So the client does not block on it. Render the fallback immediately, upgrade the
href if the lookup lands while the card is open. The href only ever gets more
specific and always points at the same service, so a swap under a focused TV
element or a hovering thumb changes where the app lands, never which app opens.
If the vendor is slow or down, the room gets today's search URL and no error.

The window is wide but not unbounded, and the part most likely to overrun it is
a cold function rather than the vendor's own latency. That is the whole argument
for the add-time call above: it moves the uncertain wait to a moment when
nobody is looking at it.

## Resolution

Extend `src/utils/webLaunch.js`; do not fork it.

```js
resolvePreferredLaunchTarget({ userServices, movieProviders, title, providerLinks })
// -> { serviceName, url, linkType: "title" | "search", deepLinks: { ios, android } } | null
```

The rule that keeps this honest: **link availability never changes which
service is chosen.** Pick the service exactly as
`resolvePreferredWebLaunchCandidate` does today — first match walking the user's
saved priority order — and only then decide the URL: the stored `webUrl` for
that service if present, else that service's search builder. Letting a missing
link bump the user down to their second-choice service would mean a stale cache
silently reorders someone's streaming preferences, which is a worse bug than the
extra tap it saves.

Only `sub` and `free` links are launch candidates. A stored rent or buy link is
read past as though the service had no link at all, which falls that service
back to its search URL rather than skipping the service — the priority-order
rule above still holds. This is the one place v1's "no checkout screens"
judgment is expressed, so it is also the only place to change when we decide a
rent link is worth offering.

`deepLinks` is carried through unused on the web. It is what Phase 4's bridge
reads, and threading it now costs nothing.

`resolvePreferredWebLaunchCandidate` stays as the zero-links path rather than
becoming a second live implementation — `resolvePreferredLaunchTarget` calls it
for the fallback branch.

Both surfaces then pass `providerLinks` into the same call. Neither changes who
sees a button: the phone stays gated on `enablePreferredWebLaunch`, the TV stays
ungated. This phase changes where the button points, and nothing else about it.

## The voice card

Ladder step 4, TV only. `src/tv/components/TvVoiceHandoffCard.jsx` renders under
the launch button on the reveal, and again after the "Feature Presentation"
transition when theater mode is on:

> Hold the mic button and say: **"Play Arrival on Netflix"**

Copy comes from one exported builder next to the resolver so the title and
service cannot drift from the button above it. Render it only when a service
matched — with no service there is nothing to say — and keep it out of the focus
chain: no `data-tv-focusable`, because it is read aloud by a person, not pressed
by a remote. The phone does not get it; nobody holds a phone's mic button at a
television.

No third-party API exists for injecting an assistant command, on Gemini, Alexa,
or Siri. We display the sentence and a person says it. That is the ceiling for
a web page on a TV, and it is why phases 3 and 4 exist.

## Slices

Two commits now that the pre-warm is gone, each shippable and revertible alone.

1. **Lookup and resolution.** Migration, pgTAP, rollback,
   `api/_lib/providerLinks.js`, `api/provider-links/lookup.js`,
   `lib/providerLinks.js`, `resolvePreferredLaunchTarget`, both surfaces
   upgraded, and the lookup fired from both call sites — `useBowl.handleAddMovie`
   and the draw. This is the phase's user-visible change, and it is small enough
   to review in one pass — which the three-slice version was not.
2. **Voice card.** TV only.

Ship slice 1 with `PROVIDER_LINKS_ENABLED=false` until the vendor key is in
place; with the flag off the resolver sees no links and every surface behaves
exactly as it does today, so the flag doubles as the rollback.

## Tests

Permissions and fallbacks are the whole risk surface here; there is no new
product state to get wrong.

- `src/utils/__tests__/webLaunch.test.js` — title URL preferred; search URL when
  the service has no link; **service choice unchanged when the higher-priority
  service has no link**; a service whose only link is rent or buy falling back
  to its search URL rather than being skipped; unknown service; empty title;
  empty `providerLinks` behaving exactly as today.
- `src/lib/__tests__/providerLinks.test.js` — TTL cache, in-flight dedupe, a
  failed request returning empty links rather than throwing.
- `api/__tests__/providerLinks.lookup.test.js` — 405, 400 (including a negative
  synthetic `tmdb_id`), 401, non-member refused, fresh cache hit spending no
  vendor call, budget exhausted, kill switch, vendor 429 recording a failure and
  a backoff, and a second lookup inside `retry_after` spending nothing.
- `api/__tests__/providerLinks.normalize.test.js` — vendor payload
  normalization: rent and buy sources retained with their `type` intact, service
  names run through `normalizeServiceName`, unknown services dropped.
- `supabase/tests/<ts>_add_title_provider_links.sql` — `anon` and
  `authenticated` cannot read either table directly; the begin RPC returns a
  cached row to a member, raises `42501` for a non-member, refuses over budget,
  and increments `request_count` exactly once per authorized fetch.
- `BowlDashboard.drawFlow` — the reveal renders its launch button before the
  lookup resolves, and upgrades the href when it lands.
- `useBowl` — adding a movie fires the lookup once after the insert commits; a
  failed lookup does not fail or alter the add; **the public add-link path fires
  nothing**. `useBowl` gains behavior here, so this is required rather than
  assumed covered downstream, per the shared-component rule in `CLAUDE.md`.

No new e2e spec. The flow it would cover — draw, then "Open [service]" — is
already in the smoke suite, and the assertion that matters is that the button
still opens the right service when the lookup fails. Add the fallback case to
the release smoke checklist rather than a new file.

Refresh the test counts in `CLAUDE.md` in the same commit that adds these, per
the tripwire rule there.

## Decisions taken

- **Look up at add and at draw; no pre-warm.** The nightly pass, the claim
  queue, the seed and prune triggers, and the budget split against the
  filter-metadata cron all existed to have links ready for titles nobody drew.
  Deleted. Two event-driven calls, each paid once, replace them.
- **Add-time lookups are for signed-in members only.** The public add-link path
  would otherwise let anyone holding a shared URL spend metered quota.
- **Region stays US-only.** The schema is keyed by region for symmetry with the
  filter cache, but nothing resolves anything but `"US"` today.
- **Subscription and free sources launch; every type is stored.** Rent and buy
  are cached with their `type` and ignored by the resolver, so offering them
  later is a resolver change rather than a re-fetch of the whole cache.
- **Thirty-day staleness.** A title's URL on a service is stable while the title
  is on the service, and which services carry it is already tracked daily by the
  filter cache.
- **The phone's opt-in gate is untouched.** `enablePreferredWebLaunch` keeps
  deciding whether the phone shows a launch button at all.

## Open questions

- Does a member ever need to know a link is a direct one? The plan says no —
  same button, same copy, better destination — but `linkType` is threaded
  through in case the TV wants to say "Play" rather than "Open" when it can
  actually start the title.
- When a title has links for two of the user's services, we take the higher
  priority one, as today. Is there a case for preferring the service where the
  link is a *play* URL over one where it is a detail page? Not until we can see
  which is which in the data.
- What would rent and buy links be *for*? The data is there from the first
  draw, so this can be answered by looking rather than guessing. The candidates
  worth weighing: a title on none of your services shows nothing at all on the
  handoff today, and "Rent on Prime Video" beats a dead end; and a bowl could
  mark which titles cost money before someone adds them. Both put a price tag
  behind a button, so neither belongs in the phase that is only trying to stop
  sending people to a search page.
- Is there ever a reason to look a title up *before* it is drawn? One: showing
  link-derived data on a browse screen — a price, or "not on any of your
  services" — would need many titles at once, which is the pre-warm design
  again and should be re-argued on its own merits rather than smuggled back in
  as an optimization. Nothing in phases 3 and 4 needs it; they launch the drawn
  title, same as this does.

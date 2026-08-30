# Provider Deep Links

Status: **plan, not implemented.** Nothing below exists in code.

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

The two candidates named in `tv-theater-mode.md` have differently shaped free
tiers, and the shape matters more than the ceiling. Watchmode is roughly 2,500
requests per *month*; the Streaming Availability API is roughly 100 per *day*.
Our access pattern is bursty by nature — a member imports thirty titles in one
sitting, and a first deploy backfills every title already in every bowl — so a
monthly bucket absorbs what a daily bucket rejects. Watchmode also takes a TMDB
id directly (`movie-<tmdbId>`) and returns per-source `web_url` alongside
`ios_url` and `android_url`, and those Android URLs are exactly what a Phase 4
`launchDeepLink(url)` bridge fires as an ACTION_VIEW intent.

Confirm the endpoint shape and field names against current docs in the first
hour of the spike rather than trusting this paragraph — the plan below only
assumes "some vendor maps a TMDB id to per-service title URLs," and
`api/_lib/providerLinks.js` is the one file that knows more than that.

Keep no payment card attached. The overrun failure mode must stay a 429, never
a bill.

## Storage: a sibling of the filter metadata cache, not a column on it

`tmdb_filter_metadata` (`supabase/migrations/20260828120000_*.sql`) already
solves almost this exact problem: a per-`(tmdb_id, region)` cache, seeded by a
trigger on `bowl_active_tmdb_movies`, pruned when the last bowl drops the title,
refreshed by a claim/complete/fail RPC trio with `refresh_token`,
`consecutive_failures`, and `retry_after`, read by members through one
security-definer RPC.

Reuse that *shape* completely. Do not reuse the *row*.

Adding `links jsonb` to `tmdb_filter_metadata` would be less code and worse
behavior, because the two sources disagree on everything that table's machinery
encodes:

- **Cost.** TMDB is free and unmetered; the vendor is 2,500 a month. One shared
  claim queue cannot be budgeted, because refusing a claim to protect the
  vendor budget would also stop refreshing the certifications that the draw
  filters depend on.
- **Staleness.** Certifications and provider sets move; the filter cache
  refreshes daily. A title's URL on Netflix does not change while it is on
  Netflix. Thirty days is the right window, and a shared `fetched_at` cannot
  express both.
- **Failure.** `consecutive_failures` and `retry_after` are per-source
  judgments. A vendor outage must not back off TMDB refreshes for the same
  title, or an unrelated 429 quietly degrades the draw.

So: a new table, the same lifecycle triggers, its own queue.

```sql
create table public.title_provider_links (
  tmdb_id bigint not null check (tmdb_id > 0),
  region text not null check (region ~ '^[A-Z]{2}$'),
  links jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  refresh_started_at timestamptz,
  refresh_token uuid,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  retry_after timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tmdb_id, region),
  check (
    (refresh_started_at is null and refresh_token is null)
    or (refresh_started_at is not null and refresh_token is not null)
  )
);
```

RLS on, all grants revoked from `public`/`anon`/`authenticated`, service role
only — same posture as the filter cache, with member reads going through
`get_title_provider_links` below.

`links` is a jsonb array of
`{ service, type, webUrl, iosUrl, androidUrl }`, with `service` already run
through `normalizeServiceName` so the stored names match
`AVAILABLE_STREAMING_SERVICES` and resolution is a plain comparison. It is
written whole and read whole and never queried by service, which is the same
reason `providers` is a `text[]` on the row today rather than a child table.

Store only sources the user could actually be sent to: vendor `type` of `sub`
or `free`. Rent and buy links are dropped at normalization — the saved service
list is a list of subscriptions, and "Open Prime Video" must never land someone
on a $4.99 checkout page.

Seed and prune with triggers on `bowl_active_tmdb_movies`, copied from
`seed_tmdb_filter_metadata_cache` / `prune_tmdb_filter_metadata_cache`. Backfill
the existing rows in the same migration, as that one did.

## Quota, enforced where it cannot drift

A counter the application increments is a counter that disagrees with the
vendor after the first crash. Put the budget in the claim.

```sql
create table public.title_provider_link_usage (
  usage_month date not null,
  region text not null,
  request_count integer not null default 0,
  primary key (usage_month, region)
);
```

`claim_title_provider_link_refreshes(p_limit, p_region, p_stale_before, ...)`
reads the current month's count, hands out at most
`monthly_budget - request_count` claims, and increments the counter by the
number it actually handed out — in the same transaction, before any request is
made. A claim that then fails still spent its request, which is exactly what the
vendor thinks too. The budget is pessimistic by construction and cannot leak.

Give the queue one more condition worth more than any tuning: **only claim rows
whose `tmdb_filter_metadata.providers` is non-empty.** A title on no
subscription service has no link to fetch and no button to upgrade. Joining the
two caches here is the single largest quota saving in the design, and it is why
the free tier holds.

Server-side controls, none of them ever a `VITE_` variable:

- `WATCHMODE_API_KEY` — absent means the feature is off, not broken.
- `PROVIDER_LINKS_ENABLED` — the kill switch. `false` makes the cron skip its
  link pass and the warm route return 503.
- `PROVIDER_LINKS_MONTHLY_BUDGET` — default 2,000, leaving headroom under the
  free tier.
- `PROVIDER_LINKS_DAILY_MAX_TITLES` — default 40.

## Refresh: a second pass on the existing cron

Vercel Hobby allows one cron a day and 60 seconds. `vercel.json` already spends
both on `/api/cron/refresh-filter-metadata`, so the link pass rides along in the
same handler rather than asking for a schedule slot that does not exist.

Filter metadata keeps first claim on the clock, because the draw filters depend
on it and this does not. Introduce `PROVIDER_LINK_RESERVE_MS` (12s) and pass
`budgetMs: FILTER_METADATA_DAILY_BUDGET_MS - PROVIDER_LINK_RESERVE_MS` to
`runDailyFilterMetadataRefresh`; the link pass then runs
`runDailyProviderLinkRefresh` against whatever remains of the shared deadline,
capped at `PROVIDER_LINKS_DAILY_MAX_TITLES`. It reuses the claim/concurrency
loop wholesale — `mapWithConcurrency`, `createRequestSignal`, and the
claimed/succeeded/failed/exhausted stats — and adds a `providerLinks` block to
the handler's JSON response and log line.

The route keeps its path. Renaming it to something source-neutral costs a
`vercel.json` change and a deploy for zero product value; the handler name being
narrower than its job is worth one comment, not a migration.

At 40 titles a day a 300-title household backfills in about eight days, and the
search-URL fallback covers every title that has not landed yet. Steady state at
a 30-day staleness window is roughly one refresh per title per month — about 300
requests against a 2,000 budget, leaving the rest for growth and warms.

## The on-demand warm

Eight days is fine for the bowl. It is not fine for tonight's movie, which is
the one title anyone will try to launch.

`api/provider-links/warm.js` mirrors `api/tmdb/movie/warm-filter-metadata.js`
exactly: POST only, `{ id, bowlId }`, bearer token, `supabaseAdmin.auth.getUser`,
then a claim scoped to that user and bowl so the membership check lives in the
same RPC that hands out the claim. It returns `202 { status: "current" }` when
nothing was claimable — already fresh, budget spent, or kill switch off — which
collapses "we chose not to" and "we already have it" into one uninteresting
answer for the client, because the client's behavior is identical either way.

`useBowl.handleDraw` fires it once, unawaited, after the draw commits. The
reveal renders immediately with whatever the read path has, and swaps in the
title URL if the warm returns while the card is still open. The href only ever
gets more specific and always points at the same service, so a swap under a
focused TV element or a hovering thumb changes where the app lands, never which
app opens.

## Read path

Links are needed for exactly one title at a time, unlike filter metadata, which
the pool resolver needs for the whole bowl. So this is a per-title read, and it
goes through Supabase rather than a serverless route — the serverless layer
exists here to hide a metered key, and reads spend nothing.

`get_title_provider_links(p_tmdb_id, p_region)`, security definer, returns the
row only when the caller shares a bowl with the title, raising `42501`
otherwise — the same guard `get_bowl_filter_metadata` uses, narrowed from a bowl
to a title.

`src/lib/providerLinks.js` wraps it with the ten-minute in-module TTL cache and
in-flight dedupe copied from `lib/streamingProviders.js`, exposes
`clearProviderLinksCache()` for tests, and returns `{ links: [] }` on any error.
Every failure in this feature is a fallback, never a message.

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

Three commits, each shippable and revertible alone.

1. **Data layer.** Migration, pgTAP, rollback, `api/_lib/providerLinks.js`,
   the refresh module, the cron's second pass. No UI reads the table yet, so
   this lands dark and can bake behind `PROVIDER_LINKS_ENABLED=false` until the
   vendor key exists and the backfill has run.
2. **Resolution and read path.** `get_title_provider_links`,
   `lib/providerLinks.js`, `resolvePreferredLaunchTarget`, both surfaces
   upgraded, the warm call on draw. This is the phase's user-visible change.
3. **Voice card.** TV only.

## Tests

Permissions and fallbacks are the whole risk surface here; there is no new
product state to get wrong.

- `src/utils/__tests__/webLaunch.test.js` — title URL preferred; search URL when
  the service has no link; **service choice unchanged when the higher-priority
  service has no link**; unknown service; empty title; empty `providerLinks`
  behaving exactly as today.
- `src/lib/__tests__/providerLinks.test.js` — TTL cache, in-flight dedupe, RPC
  error returning empty.
- `api/__tests__/providerLinks.warm.test.js` — 405, 400, 401, non-member
  refused, budget exhausted returning 202, kill switch returning 503, vendor 429
  recording a failure and a backoff.
- `api/__tests__/providerLinkRefresh.test.js` — claim/complete/fail round trip,
  budget accounting, vendor payload normalization including rent/buy dropped and
  service names normalized.
- `api/__tests__/cron.refreshFilterMetadata.test.js` — extended: the filter pass
  is unchanged when links are disabled, and the link pass only runs with time
  left on the shared deadline.
- `supabase/tests/<ts>_add_title_provider_links.sql` — `anon` and
  `authenticated` cannot read the table directly; the read RPC returns rows to a
  member and raises `42501` for a non-member; the claim RPC refuses over budget;
  prune fires when the last bowl drops the title.

No new e2e spec. The flow it would cover — draw, then "Open [service]" — is
already in the smoke suite, and the assertion that matters is that the button
still opens the right service when the fetch fails. Add the fallback case to the
release smoke checklist rather than a new file.

Refresh the test counts in `CLAUDE.md` in the same commits that add these, per
the tripwire rule there.

## Decisions taken

- **Region stays US-only.** The schema is keyed by region because the filter
  cache is, but nothing resolves anything but `"US"` today and this phase does
  not change that.
- **Subscription and free sources only.** Rent and buy are dropped.
- **Thirty-day staleness.** A title's URL on a service is stable while the title
  is on the service, and provider *membership* is already tracked daily by the
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
- The warm call spends quota on a title someone drew. A bowl drawn ten times in
  an evening spends ten warms at most, and only on titles the cron had not
  reached. If that proves noisy, gate the warm on the title being missing rather
  than on the draw.

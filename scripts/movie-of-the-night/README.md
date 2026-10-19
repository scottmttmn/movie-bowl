# Movie of the Night feed probe

This is a read-only feasibility sample for improving the daily refresh queue.
It does not change the queue, write to the database, or publish an API route.

Status: deferred until daily runs consistently leave a backlog at the configured
title limit (300 by default) or time budget. The agreed future design keeps one
queue: missing data first, then age since the last successful refresh with a
bounded boost for relevant reported changes. Age eventually takes precedence;
there is no reserved share of each run. The current daily freshness target
remains the baseline. See the matching entry in `TODO.md`.

The on-demand notices in search, movie details, and My Movies use a separate
title lookup and cache; see [Departure notices](../../supabase/README.md#departure-notices).
They do not run this feed probe or change refresh priority.

Inject `MOVIE_OF_THE_NIGHT_API_KEY` into the process, then run:

```sh
node scripts/movie-of-the-night/probe.mjs
```

The probe never loads `.env` files. A Vercel Preview build can run it with the
project's Secret kept on Vercel; use a deployment-specific build-command
override, leaving the normal project build command alone:

```sh
npm run build && MOVIE_OF_THE_NIGHT_PROBE_CONTEXT=preview node scripts/movie-of-the-night/probe.mjs
```

The command refuses Vercel environments other than Preview. Every invocation
makes at most eight provider requests: up to two pages each of `new`, `removed`,
`updated`, and `expiring` US movie changes. Past events cover the preceding
24 hours; future departures cover the next 31 days. Unknown dates are included.
Pagination is deliberately capped, and the report marks unfinished samples.
Requests time out after 15 seconds. To retry only a failed query, set
`MOVIE_OF_THE_NIGHT_PROBE_TYPES=removed` (or a comma-separated subset of the
four supported types) for that one invocation. This avoids spending requests
on queries that already succeeded.
`MOVIE_OF_THE_NIGHT_PROBE_CATALOGS=netflix.subscription` narrows the sample
to a catalog; a comma-separated list of up to 32 catalogs is supported. Use
this to distinguish a slow all-service query from a failure of the endpoint.
Do not use a capped sample to infer that an absent movie has not changed or
that a daily feed will fit the free quota.

When server-side Supabase configuration is present, the script reads up to
1,000 `bowl_active_tmdb_movies` rows from that environment and reports only the
number of distinct movies matching the sample. The cap is labeled, and a
Preview database's matches say nothing about Production's bowls. No title,
bowl ID, user ID, credential, or raw vendor error is printed. The JSON report
appears in the build log with the prefix `[movie-of-the-night-probe]`.

Keep this out of automatic builds and recurring API checks: each invocation
spends real quota. Run the focused tests without credentials:

```sh
npx vitest run scripts/movie-of-the-night/__tests__/probe.test.js
```

## Live findings — October 19, 2026

The account's Preview Secret authenticated successfully. These are separate,
bounded queries taken at different times, not a complete synchronized snapshot:

| Query | Scope | Records sampled | Pagination |
| --- | --- | --- | --- |
| New, preceding 24 hours | All US catalogs | 50 | More pages remained |
| Updated, preceding 24 hours | All US catalogs | 50 | More pages remained |
| Expiring, next 31 days | All US catalogs | 50 | More pages remained |
| Removed, preceding 24 hours | Netflix subscription, US | 4 | Complete for this query |

All 150 records in the first three queries mapped to TMDB movie IDs, covering
115 distinct movies. No sampled title matched the 24 active movies in the
Preview database; this is not a measurement of Production coverage.

The all-catalog `removed` query timed out with both 5-second and 15-second
client deadlines. Narrowing it to `netflix.subscription` completed in under a
second. The three builds together attempted nine vendor requests. The final
Preview build completed successfully; the first two builds deliberately
reported failure because their diagnostic query timed out.

The initial sample confirms real pagination beyond Watchmode's ten-departure
preview, but does not establish the cost of collecting every relevant change
daily. Before wiring the cron, measure narrower relevant catalog queries,
apply a hard request/time budget, and preserve oldest-first refreshes whenever
the change feed is incomplete or unavailable. No refresh selection or database
schema has been changed by this experiment.

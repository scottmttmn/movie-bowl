// A bounded, read-only sample before changing the refresh queue. Run with the
// provider key injected into the process; this script never loads env files.
// On Vercel, run during a Preview build so a Secret need not leave Vercel.
import { pathToFileURL } from "node:url";
import { getSupabaseAdmin } from "../../api/_lib/supabaseAdmin.js";

const CHANGE_TYPES = ["new", "removed", "updated", "expiring"];
const DAY_SECONDS = 24 * 60 * 60;
const ACTIVE_ROW_LIMIT = 1000;

function movieId(show) {
  const match = /^movie\/([1-9]\d*)$/.exec(String(show?.tmdbId || ""));
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}

function validPage(body) {
  return body && Array.isArray(body.changes)
    && body.shows && typeof body.shows === "object" && !Array.isArray(body.shows)
    && typeof body.hasMore === "boolean"
    && (!body.hasMore || (typeof body.nextCursor === "string" && body.nextCursor.length > 0));
}

export async function probeMovieOfTheNight({
  apiKey,
  fetchImpl = fetch,
  now = Date.now(),
  pagesPerType = 2,
  maxRequests = 8,
  activeTmdbIds = new Set(),
  changeTypes = CHANGE_TYPES,
  requestTimeoutMs = 15000,
  catalogs = [],
} = {}) {
  if (!apiKey) throw new Error("MOVIE_OF_THE_NIGHT_API_KEY is not configured");
  if (![pagesPerType, maxRequests].every((value) => Number.isInteger(value) && value >= 1 && value <= 20)) {
    throw new Error("Probe limits must be integers between 1 and 20");
  }
  if (!Array.isArray(changeTypes) || !changeTypes.length
    || new Set(changeTypes).size !== changeTypes.length
    || changeTypes.some((type) => !CHANGE_TYPES.includes(type))) {
    throw new Error("Select distinct supported change types");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 30000) {
    throw new Error("Probe request timeout must be between 1 and 30000 milliseconds");
  }
  if (!Array.isArray(catalogs) || catalogs.length > 32
    || catalogs.some((catalog) => typeof catalog !== "string"
      || !/^[a-z0-9_-]+(?:\.[a-z0-9_-]+){0,2}$/.test(catalog))) {
    throw new Error("Select up to 32 catalog identifiers");
  }
  const timestamp = Math.floor(now / 1000);
  const report = {
    sampledAt: new Date(now).toISOString(),
    country: "us",
    catalogs,
    requests: 0,
    maxRequests,
    pagesPerType,
    uniqueMovies: 0,
    matchingActiveMovies: 0,
    types: {},
  };
  const allIds = new Set();
  const allMatches = new Set();

  for (const type of changeTypes) {
    const stats = {
      pages: 0, records: 0, uniqueMovies: 0, matchingActiveMovies: 0,
      knownDates: 0, unknownDates: 0, unmappedRecords: 0,
      duplicateRecords: 0, services: {}, hasMore: null, stopped: "request_limit",
    };
    report.types[type] = stats;
    const ids = new Set();
    const matches = new Set();
    const events = new Set();
    const cursors = new Set();
    let cursor;

    while (stats.pages < pagesPerType && report.requests < maxRequests) {
      const url = new URL("https://api.movieofthenight.com/v4/changes");
      const isFuture = type === "expiring";
      url.search = new URLSearchParams({
        country: "us", change_type: type, item_type: "show", show_type: "movie",
        from: String(isFuture ? timestamp : timestamp - DAY_SECONDS),
        to: String(isFuture ? timestamp + 31 * DAY_SECONDS : timestamp),
        order_direction: isFuture ? "asc" : "desc",
        include_unknown_dates: "true",
        ...(catalogs.length ? { catalogs: catalogs.join(",") } : {}),
        ...(cursor ? { cursor } : {}),
      }).toString();
      report.requests += 1;
      let body;
      try {
        const response = await fetchImpl(url, {
          headers: { "X-API-Key": apiKey },
          signal: AbortSignal.timeout(requestTimeoutMs),
          redirect: "error",
        });
        if (!response.ok) {
          // Never log upstream bodies, headers or exception messages: they may
          // repeat a credential. A status code is enough to diagnose access.
          stats.stopped = `http_${response.status}`;
          break;
        }
        body = await response.json();
      } catch (error) {
        stats.stopped = ["TimeoutError", "AbortError"].includes(error?.name)
          ? "request_timeout" : "request_failed";
        break;
      }
      if (!validPage(body)) {
        stats.stopped = "invalid_response";
        break;
      }
      stats.pages += 1;
      stats.records += body.changes.length;
      stats.hasMore = body.hasMore;
      for (const change of body.changes) {
        const id = movieId(body.shows[String(change?.showId)]);
        if (id === null) {
          stats.unmappedRecords += 1;
          continue;
        }
        const eventKey = JSON.stringify([
          change.showId, change.service?.id, change.streamingOptionType,
          change.addon?.id, change.timestamp, change.link,
        ]);
        if (events.has(eventKey)) {
          stats.duplicateRecords += 1;
          continue;
        }
        events.add(eventKey);
        ids.add(id);
        allIds.add(id);
        if (activeTmdbIds.has(id)) {
          matches.add(id);
          allMatches.add(id);
        }
        if (Number.isFinite(change.timestamp) && change.timestamp > 0) stats.knownDates += 1;
        else stats.unknownDates += 1;
        const service = change.service?.id;
        // Only known-safe identifier strings enter the report. Show titles,
        // source URLs, bowl ids and user information are never printed.
        if (typeof service === "string" && /^[a-z0-9_-]{1,50}$/.test(service)
          && !["__proto__", "constructor", "prototype"].includes(service)) {
          stats.services[service] = (stats.services[service] || 0) + 1;
        }
      }
      stats.uniqueMovies = ids.size;
      stats.matchingActiveMovies = matches.size;
      if (!body.hasMore) {
        stats.stopped = "complete";
        break;
      }
      if (cursors.has(body.nextCursor)) {
        stats.stopped = "repeated_cursor";
        break;
      }
      cursors.add(body.nextCursor);
      cursor = body.nextCursor;
      stats.stopped = stats.pages >= pagesPerType ? "page_limit" : "request_limit";
    }
  }
  report.uniqueMovies = allIds.size;
  report.matchingActiveMovies = allMatches.size;
  return report;
}

export async function readActiveMovieSample(client) {
  const { data, error } = await client.from("bowl_active_tmdb_movies")
    .select("tmdb_id").limit(ACTIVE_ROW_LIMIT).abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("Active movie read failed");
  const rows = Array.isArray(data) ? data : [];
  const ids = new Set(rows.map((row) => Number(row.tmdb_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0));
  return { ids, rows: rows.length, possiblyTruncated: rows.length === ACTIVE_ROW_LIMIT };
}

export async function main(env = process.env) {
  // The project's automatic system-variable exposure can be disabled, so a
  // Preview-only build override supplies its explicit context when needed.
  const environment = env.VERCEL_ENV || env.MOVIE_OF_THE_NIGHT_PROBE_CONTEXT
    || (env.VERCEL ? "unknown" : "local");
  if (!["local", "preview"].includes(environment)) {
    throw new Error("This probe runs only locally or in Vercel Preview");
  }
  if (!env.MOVIE_OF_THE_NIGHT_API_KEY) {
    throw new Error("MOVIE_OF_THE_NIGHT_API_KEY is not configured");
  }
  let sample = { ids: new Set(), status: "not_configured" };
  if ((env.SUPABASE_URL || env.VITE_SUPABASE_URL)
    && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) {
    try {
      sample = { ...await readActiveMovieSample(getSupabaseAdmin()), status: "read" };
    } catch {
      sample.status = "read_failed";
    }
  }
  const report = await probeMovieOfTheNight({
    apiKey: env.MOVIE_OF_THE_NIGHT_API_KEY,
    activeTmdbIds: sample.ids,
    ...(env.MOVIE_OF_THE_NIGHT_PROBE_TYPES
      ? { changeTypes: env.MOVIE_OF_THE_NIGHT_PROBE_TYPES.split(",") } : {}),
    ...(env.MOVIE_OF_THE_NIGHT_PROBE_CATALOGS
      ? { catalogs: env.MOVIE_OF_THE_NIGHT_PROBE_CATALOGS.split(",") } : {}),
  });
  report.environment = environment;
  report.activeMovieSample = {
    status: sample.status, rows: sample.rows ?? null, uniqueMovies: sample.ids.size,
    possiblyTruncated: sample.possiblyTruncated ?? null,
  };
  console.log(`[movie-of-the-night-probe] ${JSON.stringify(report)}`);
  if (Object.values(report.types).some((stats) => !["complete", "page_limit"].includes(stats.stopped))) {
    process.exitCode = 1;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // No raw error text, including failures before a report can be produced.
    console.error("[movie-of-the-night-probe] Could not run; check Preview configuration.");
    process.exitCode = 1;
  });
}

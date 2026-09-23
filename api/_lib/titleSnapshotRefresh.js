import { tmdbFetch } from "./tmdb.js";
import { recordServiceUsage } from "./usageCounters.js";

// TMDB permits caching for at most six months, and the details copied beside
// every slip and history entry are a cache like any other. Refreshing at 150
// days leaves a month of daily passes for a title to succeed before
// select_tmdb_title_snapshot_refreshes clears what it could not refresh.
export const TITLE_SNAPSHOT_REFRESH_AGE_MS = 150 * 24 * 60 * 60 * 1000;
export const TITLE_SNAPSHOT_DAILY_MAX_TITLES = 100;
export const TITLE_SNAPSHOT_DAILY_BUDGET_MS = 10 * 1000;
export const TITLE_SNAPSHOT_REFRESH_CONCURRENCY = 4;

export function mapTmdbDetailsToSnapshot(details) {
  const source = details && typeof details === "object" ? details : {};
  const runtime = Number(source.runtime);
  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.release_date || ""))
    ? source.release_date
    : null;
  return {
    title: String(source.title || "").trim() || null,
    posterPath: source.poster_path || null,
    releaseDate,
    runtime: Number.isInteger(runtime) && runtime > 0 ? runtime : null,
    genres: (Array.isArray(source.genres) ? source.genres : [])
      .map((genre) => (typeof genre === "string" ? genre : genre?.name))
      .map((name) => String(name || "").trim())
      .filter(Boolean),
    overview: String(source.overview || "").trim() || null,
  };
}

// `details` null records that TMDB no longer has the title: its copies lose
// their descriptive fields and are stamped, so it is not fetched every day.
export async function applyTitleSnapshot(supabaseAdmin, tmdbId, details) {
  const snapshot = details ? mapTmdbDetailsToSnapshot(details) : null;
  const { data, error } = await supabaseAdmin.rpc("apply_tmdb_title_snapshot", {
    p_tmdb_id: tmdbId,
    p_found: Boolean(snapshot),
    p_title: snapshot?.title ?? null,
    p_poster_path: snapshot?.posterPath ?? null,
    p_release_date: snapshot?.releaseDate ?? null,
    p_runtime: snapshot?.runtime ?? null,
    p_genres: snapshot?.genres ?? [],
    p_overview: snapshot?.overview ?? null,
  });
  if (error) throw error;
  return Number(data) || 0;
}

export async function fetchTmdbTitleDetails(tmdbId, { signal } = {}) {
  return tmdbFetch(`/movie/${encodeURIComponent(tmdbId)}`, { signal });
}

async function refreshTitle(supabaseAdmin, tmdbId, { fetchDetails, signal }) {
  let details;
  try {
    details = await fetchDetails(tmdbId, { signal });
  } catch (error) {
    if (error?.statusCode === 404) {
      await applyTitleSnapshot(supabaseAdmin, tmdbId, null);
      return "missing";
    }
    // Anything else is worth another try tomorrow; the title keeps its place at
    // the front of the queue because its stamp did not move.
    console.error("[titleSnapshotRefresh] Failed to fetch TMDB title", { tmdbId, error });
    return "failed";
  }
  await applyTitleSnapshot(supabaseAdmin, tmdbId, details);
  return "refreshed";
}

function createRequestSignal(timeoutMs) {
  if (typeof AbortSignal?.timeout !== "function") return undefined;
  return AbortSignal.timeout(Math.max(1, timeoutMs));
}

export async function runTitleSnapshotRefresh(
  supabaseAdmin,
  {
    nowFn = Date.now,
    fetchDetails = fetchTmdbTitleDetails,
    maxTitles = TITLE_SNAPSHOT_DAILY_MAX_TITLES,
    budgetMs = TITLE_SNAPSHOT_DAILY_BUDGET_MS,
    concurrency = TITLE_SNAPSHOT_REFRESH_CONCURRENCY,
  } = {}
) {
  const startedAt = nowFn();
  const deadline = startedAt + budgetMs;
  const stats = { selected: 0, refreshed: 0, missing: 0, failed: 0, exhausted: false };

  // Selecting also clears whatever has passed six months, so it runs even when
  // there is no time left to fetch anything.
  const { data, error } = await supabaseAdmin.rpc("select_tmdb_title_snapshot_refreshes", {
    p_limit: maxTitles,
    p_stale_before: new Date(startedAt - TITLE_SNAPSHOT_REFRESH_AGE_MS).toISOString(),
  });
  if (error) throw error;

  const tmdbIds = (Array.isArray(data) ? data : [])
    .map((row) => Number(row?.tmdb_id))
    .filter((tmdbId) => Number.isInteger(tmdbId) && tmdbId > 0);
  stats.exhausted = tmdbIds.length < maxTitles;

  let cursor = 0;
  let requests = 0;
  const worker = async () => {
    while (cursor < tmdbIds.length && deadline - nowFn() > 1_000) {
      const tmdbId = tmdbIds[cursor];
      cursor += 1;
      requests += 1;
      stats.selected += 1;
      try {
        const outcome = await refreshTitle(supabaseAdmin, tmdbId, {
          fetchDetails,
          signal: createRequestSignal(Math.min(5_000, Math.max(1, deadline - nowFn()))),
        });
        stats[outcome] += 1;
      } catch (applyError) {
        console.error("[titleSnapshotRefresh] Failed to save TMDB title", { tmdbId, error: applyError });
        stats.failed += 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(concurrency, tmdbIds.length)) }, worker)
    );
  } finally {
    await recordServiceUsage("tmdb_request", requests, {
      client: supabaseAdmin,
      label: "cron/refresh-title-snapshots",
    });
  }

  if (cursor < tmdbIds.length) stats.exhausted = false;
  return { ...stats, elapsedMs: Math.max(0, nowFn() - startedAt) };
}

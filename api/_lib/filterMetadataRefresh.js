import { fetchTmdbFilterMetadata } from "./tmdbFilterMetadata.js";

export const FILTER_METADATA_REGION = "US";
export const FILTER_METADATA_STALE_MS = 24 * 60 * 60 * 1000;
export const FILTER_METADATA_REFRESH_CONCURRENCY = 6;
export const FILTER_METADATA_REFRESH_BATCH_SIZE = 12;
export const FILTER_METADATA_DAILY_MAX_TITLES = 180;
export const FILTER_METADATA_DAILY_BUDGET_MS = 45 * 1000;

function getClaimParams({
  limit,
  region = FILTER_METADATA_REGION,
  staleBefore,
  tmdbId = null,
  bowlId = null,
  userId = null,
}) {
  return {
    p_limit: limit,
    p_region: region,
    p_stale_before: staleBefore,
    p_tmdb_id: tmdbId,
    p_bowl_id: bowlId,
    p_user_id: userId,
  };
}

export async function claimFilterMetadataRefreshes(supabaseAdmin, options) {
  const { data, error } = await supabaseAdmin.rpc(
    "claim_tmdb_filter_metadata_refreshes",
    getClaimParams(options)
  );
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function recordRefreshFailure(supabaseAdmin, claim, error) {
  const { error: recordError } = await supabaseAdmin.rpc(
    "fail_tmdb_filter_metadata_refresh",
    {
      p_tmdb_id: claim.tmdb_id,
      p_region: claim.region,
      p_refresh_token: claim.refresh_token,
      p_error: String(error?.message || "Unknown refresh failure"),
    }
  );
  if (recordError) {
    console.error("[filterMetadataRefresh] Failed to record refresh failure", recordError);
  }
}

export async function refreshFilterMetadataClaim(
  supabaseAdmin,
  claim,
  { fetchMetadata = fetchTmdbFilterMetadata, signal } = {}
) {
  try {
    const metadata = await fetchMetadata(claim.tmdb_id, {
      region: claim.region,
      signal,
    });
    const { data, error } = await supabaseAdmin.rpc(
      "complete_tmdb_filter_metadata_refresh",
      {
        p_tmdb_id: claim.tmdb_id,
        p_region: claim.region,
        p_refresh_token: claim.refresh_token,
        p_certification: metadata.certification,
        p_providers: metadata.providers,
        p_fetched_at: metadata.fetchedAt,
      }
    );
    if (error) throw error;
    return { ok: data !== false, tmdbId: claim.tmdb_id };
  } catch (error) {
    console.error("[filterMetadataRefresh] Failed to refresh TMDB metadata", {
      tmdbId: claim.tmdb_id,
      error,
    });
    await recordRefreshFailure(supabaseAdmin, claim, error);
    return { ok: false, tmdbId: claim.tmdb_id };
  }
}

async function mapWithConcurrency(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index]);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

function createRequestSignal(timeoutMs) {
  if (typeof AbortSignal?.timeout !== "function") return undefined;
  return AbortSignal.timeout(Math.max(1, timeoutMs));
}

export async function runDailyFilterMetadataRefresh(
  supabaseAdmin,
  {
    nowFn = Date.now,
    fetchMetadata = fetchTmdbFilterMetadata,
    maxTitles = FILTER_METADATA_DAILY_MAX_TITLES,
    budgetMs = FILTER_METADATA_DAILY_BUDGET_MS,
    batchSize = FILTER_METADATA_REFRESH_BATCH_SIZE,
    concurrency = FILTER_METADATA_REFRESH_CONCURRENCY,
  } = {}
) {
  const startedAt = nowFn();
  const deadline = startedAt + budgetMs;
  const staleBefore = new Date(startedAt - FILTER_METADATA_STALE_MS).toISOString();
  const stats = { claimed: 0, succeeded: 0, failed: 0, exhausted: false };

  while (stats.claimed < maxTitles && deadline - nowFn() > 2_000) {
    const claims = await claimFilterMetadataRefreshes(supabaseAdmin, {
      limit: Math.min(batchSize, maxTitles - stats.claimed),
      staleBefore,
    });
    if (claims.length === 0) {
      stats.exhausted = true;
      break;
    }

    stats.claimed += claims.length;
    const timeoutMs = Math.min(10_000, Math.max(1_000, deadline - nowFn()));
    const results = await mapWithConcurrency(
      claims,
      (claim) => refreshFilterMetadataClaim(supabaseAdmin, claim, {
        fetchMetadata,
        signal: createRequestSignal(timeoutMs),
      }),
      concurrency
    );
    results.forEach((result) => {
      if (result.ok) stats.succeeded += 1;
      else stats.failed += 1;
    });
  }

  return {
    ...stats,
    elapsedMs: Math.max(0, nowFn() - startedAt),
  };
}

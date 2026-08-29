import {
  recordFilterMetadataRefreshRun,
  runDailyFilterMetadataRefresh,
} from "../_lib/filterMetadataRefresh.js";
import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export const config = { maxDuration: 60 };

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[api/cron/refresh-filter-metadata] Missing CRON_SECRET");
    res.status(500).json({ error: "Cron refresh is not configured" });
    return;
  }
  if (getBearerToken(req) !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const startedAt = new Date();
  let supabaseAdmin;

  try {
    supabaseAdmin = getSupabaseAdmin();
    const stats = await runDailyFilterMetadataRefresh(supabaseAdmin, {
      maxTitles: getPositiveInteger(
        process.env.FILTER_METADATA_DAILY_MAX_TITLES,
        undefined
      ),
    });
    let report = null;
    try {
      report = await recordFilterMetadataRefreshRun(supabaseAdmin, {
        status: "completed",
        startedAt,
        completedAt: new Date(),
        stats,
      });
    } catch (reportError) {
      console.error(
        "[api/cron/refresh-filter-metadata] Failed to record refresh report",
        reportError
      );
    }

    const result = report
      ? { ...stats, remainingStale: report.remainingStale }
      : stats;
    console.info("[api/cron/refresh-filter-metadata] Refresh complete", result);
    res.status(200).json(result);
  } catch (error) {
    console.error("[api/cron/refresh-filter-metadata] Refresh failed", error);
    if (supabaseAdmin) {
      try {
        const completedAt = new Date();
        await recordFilterMetadataRefreshRun(supabaseAdmin, {
          status: "failed",
          startedAt,
          completedAt,
          stats: { elapsedMs: completedAt.getTime() - startedAt.getTime() },
          error,
        });
      } catch (reportError) {
        console.error(
          "[api/cron/refresh-filter-metadata] Failed to record failed refresh report",
          reportError
        );
      }
    }
    res.status(500).json({ error: "Failed to refresh filter metadata" });
  }
}

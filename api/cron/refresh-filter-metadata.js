import { runDailyFilterMetadataRefresh } from "../_lib/filterMetadataRefresh.js";
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

  try {
    const stats = await runDailyFilterMetadataRefresh(getSupabaseAdmin(), {
      maxTitles: getPositiveInteger(
        process.env.FILTER_METADATA_DAILY_MAX_TITLES,
        undefined
      ),
    });
    console.info("[api/cron/refresh-filter-metadata] Refresh complete", stats);
    res.status(200).json(stats);
  } catch (error) {
    console.error("[api/cron/refresh-filter-metadata] Refresh failed", error);
    res.status(500).json({ error: "Failed to refresh filter metadata" });
  }
}

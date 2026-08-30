import {
  FILTER_METADATA_STALE_MS,
  claimFilterMetadataRefreshes,
  refreshFilterMetadataClaim,
} from "./filterMetadataRefresh.js";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const tmdbId = Number(req.body?.id);
  const bowlId = String(req.body?.bowlId || "");
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !UUID_PATTERN.test(bowlId)) {
    res.status(400).json({ error: "Invalid movie or bowl id" });
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const claims = await claimFilterMetadataRefreshes(supabaseAdmin, {
      limit: 1,
      staleBefore: new Date(Date.now() - FILTER_METADATA_STALE_MS).toISOString(),
      tmdbId,
      bowlId,
      userId: user.id,
    });
    if (claims.length === 0) {
      res.status(202).json({ status: "current" });
      return;
    }

    const result = await refreshFilterMetadataClaim(supabaseAdmin, claims[0]);
    if (!result.ok) {
      res.status(502).json({ error: "Failed to warm filter metadata" });
      return;
    }
    res.status(200).json({ status: "refreshed" });
  } catch (error) {
    console.error("[api/tmdb/movie/warm-filter-metadata] Failed to warm metadata", error);
    res.status(500).json({ error: "Failed to warm filter metadata" });
  }
}

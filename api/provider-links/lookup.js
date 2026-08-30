import { fetchProviderLinks } from "../_lib/providerLinks.js";
import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function monthlyBudget() {
  const value = process.env.PROVIDER_LINKS_MONTHLY_BUDGET;
  if (value === undefined) return 500;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2147483647 ? parsed : 0;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { id, bowlId } = req.body || {};
  const tmdbId = Number(id);
  if (
    !["string", "number"].includes(typeof id) ||
    !Number.isSafeInteger(tmdbId) || tmdbId <= 0 ||
    typeof bowlId !== "string" || !UUID_PATTERN.test(bowlId)
  ) {
    res.status(400).json({ error: "Invalid movie or bowl" });
    return;
  }
  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (process.env.PROVIDER_LINKS_ENABLED !== "true" || !process.env.WATCHMODE_API_KEY?.trim()) {
      res.status(200).json({ links: [] });
      return;
    }
    const params = { p_tmdb_id: tmdbId, p_region: "US" };
    const { data, error } = await admin.rpc("begin_title_provider_link_fetch", {
      ...params,
      p_bowl_id: bowlId,
      p_user_id: authData.user.id,
      p_monthly_budget: monthlyBudget(),
    });
    // Authorization failures never expose an existing global cache row.
    if (error) {
      if (error.code !== "42501") console.error("[api/provider-links/lookup] Lookup unavailable");
      res.status(200).json({ links: [] });
      return;
    }
    if (!data?.should_fetch) {
      res.status(200).json({ links: data?.links || [], fetchedAt: data?.fetched_at || null });
      return;
    }
    try {
      const links = await fetchProviderLinks(tmdbId);
      const { data: fetchedAt, error: writeError } = await admin.rpc("complete_title_provider_link_fetch", {
        ...params, p_links: links,
      });
      if (writeError) throw new Error("Provider cache write failed");
      res.status(200).json({ links, fetchedAt });
    } catch (error) {
      // Never store arbitrary upstream bodies or errors that might contain credentials.
      const message = /^Watchmode request failed \(\d{3}\)$/.test(error?.message)
        ? error.message : "Provider lookup failed";
      await admin.rpc("fail_title_provider_link_fetch", { ...params, p_error: message });
      res.status(200).json({ links: [] });
    }
  } catch {
    console.error("[api/provider-links/lookup] Lookup unavailable");
    res.status(200).json({ links: [] });
  }
}

import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { tmdbFetch } from "./tmdb.js";
import { normalizeTmdbWatchProviders } from "../../src/utils/tmdbWatchProviders.js";
import { matchDepartureServices } from "../../src/utils/titleDepartures.js";
import { fetchTitleDepartures } from "./titleDepartures.js";

function requestBudget() {
  // Each Supabase project has its own counter, even when deployments share a key.
  const ceiling = process.env.VERCEL_ENV === "production" ? 900 : 100;
  const value = process.env.MOVIE_OF_THE_NIGHT_REQUEST_BUDGET;
  if (value === undefined) return ceiling;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 900
    ? Math.min(parsed, ceiling)
    : 0;
}

function logFailure(stage, error) {
  // Never log upstream messages, URLs, credentials, or request/profile contents.
  const code = /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(error?.code) ? error.code : undefined;
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 100 && error.statusCode <= 599
      ? error.statusCode
      : undefined;
  console.error("[api/title-departures/lookup] Lookup failed", { stage, code, status });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = req.body?.id;
  const tmdbId = Number(id);
  const bowlId = req.body?.bowlId ?? null;
  if (!["number", "string"].includes(typeof id) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: "Invalid movie" });
  }
  if (
    bowlId !== null &&
    (typeof bowlId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bowlId))
  ) {
    return res.status(400).json({ error: "Invalid bowl" });
  }
  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const empty = () => res.status(200).json({ departures: [] });
  try {
    const admin = getSupabaseAdmin();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user?.id) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.MOVIE_OF_THE_NIGHT_API_KEY?.trim()) return empty();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("streaming_services")
      .eq("id", auth.user.id)
      .single();
    if (profileError) {
      logFailure("profile_read", profileError);
      return empty();
    }
    const services = profile?.streaming_services;
    if (!Array.isArray(services) || matchDepartureServices(services, services).length === 0)
      return empty();

    const { data: cached, error: cacheError } = await admin
      .from("title_departures")
      .select("departures, valid_until")
      .eq("tmdb_id", tmdbId)
      .eq("region", "US")
      .maybeSingle();
    if (cacheError) {
      logFailure("cache_read", cacheError);
      return empty();
    }
    const freshCache = Date.parse(cached?.valid_until) > Date.now();
    // Search and unsaved details only read fresh data. They cannot reserve quota
    // or make fallback TMDB requests just to discover a departure cache miss.
    if (!bowlId && !freshCache) return empty();

    const { data: metadata, error: metadataError } = await admin
      .from("tmdb_filter_metadata")
      .select("providers, fetched_at")
      .eq("tmdb_id", tmdbId)
      .eq("region", "US")
      .maybeSingle();
    if (metadataError) {
      logFailure("metadata_read", metadataError);
      return empty();
    }
    let providers = metadata?.providers;
    if (!metadata?.fetched_at || Date.parse(metadata.fetched_at) < Date.now() - 86400000) {
      try {
        const data = await tmdbFetch(`/movie/${tmdbId}/watch/providers`, {
          signal: AbortSignal.timeout(5000),
        });
        providers = normalizeTmdbWatchProviders(data).providers;
      } catch (error) {
        logFailure("availability_fetch", error);
        return empty();
      }
    }
    const matches = matchDepartureServices(providers || [], services);
    if (matches.length === 0) return empty();
    if (freshCache) {
      return res.status(200).json({
        departures: cached.departures.filter((departure) => matches.includes(departure.service)),
        validUntil: cached.valid_until,
      });
    }

    // SQL verifies membership and the active bowl title before reserving quota.
    const { data: claim, error } = await admin.rpc("begin_title_departure_fetch", {
      p_tmdb_id: tmdbId,
      p_bowl_id: bowlId,
      p_user_id: auth.user.id,
      p_budget: requestBudget(),
    });
    if (error || !claim) {
      if (error?.code !== "42501") logFailure("reservation", error);
      return empty();
    }
    let departures = claim.departures || [];
    let validUntil = claim.valid_until || null;
    if (claim.should_fetch) {
      let stage = "vendor_fetch";
      try {
        departures = await fetchTitleDepartures(tmdbId);
        stage = "cache_write";
        const { data: completed, error: writeError } = await admin.rpc(
          "complete_title_departure_fetch",
          {
            p_tmdb_id: tmdbId,
            p_token: claim.token,
            p_departures: departures,
          },
        );
        if (writeError || !completed) throw writeError || new Error("Departure cache unavailable");
        validUntil = completed;
      } catch (error) {
        logFailure(stage, error);
        const { error: backoffError } = await admin.rpc("fail_title_departure_fetch", {
          p_tmdb_id: tmdbId,
          p_token: claim.token,
        });
        if (backoffError) logFailure("backoff_write", backoffError);
        return empty();
      }
    }
    return res.status(200).json({
      departures: departures.filter((departure) => matches.includes(departure.service)),
      validUntil,
    });
  } catch (error) {
    logFailure("unexpected", error);
    return empty();
  }
}

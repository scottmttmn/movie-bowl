import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { tmdbFetch } from "./tmdb.js";
import { normalizeTmdbWatchProviders } from "../../src/utils/tmdbWatchProviders.js";
import { matchUserServices } from "../../src/utils/streamingServices.js";
import { fetchTitleDepartures } from "./titleDepartures.js";

function requestBudget() {
  const value = process.env.MOVIE_OF_THE_NIGHT_REQUEST_BUDGET;
  if (value === undefined) return 900;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 900 ? parsed : 0;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = req.body?.id;
  const tmdbId = Number(id);
  if (!["number", "string"].includes(typeof id) || !Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: "Invalid movie" });
  }
  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const empty = () => res.status(200).json({ departures: [] });
  try {
    const admin = getSupabaseAdmin();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user?.id) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.MOVIE_OF_THE_NIGHT_API_KEY?.trim()) return empty();
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("streaming_services").eq("id", auth.user.id).single();
    const services = profile?.streaming_services;
    if (profileError || !Array.isArray(services) || services.length === 0) return empty();

    const { data: metadata, error: metadataError } = await admin.from("tmdb_filter_metadata")
      .select("providers, fetched_at").eq("tmdb_id", tmdbId).eq("region", "US").maybeSingle();
    if (metadataError) return empty();
    let providers = metadata?.providers;
    if (!metadata?.fetched_at || Date.parse(metadata.fetched_at) < Date.now() - 86400000) {
      const data = await tmdbFetch(`/movie/${tmdbId}/watch/providers`, { signal: AbortSignal.timeout(5000) });
      providers = normalizeTmdbWatchProviders(data).providers;
    }
    const matches = matchUserServices(providers || [], services);
    if (matches.length === 0) return empty();
    // The server reads both sides of this gate; request bodies cannot claim a
    // saved service or provider to spend the shared vendor budget.
    const { data: claim, error } = await admin.rpc("begin_title_departure_fetch", {
      p_tmdb_id: tmdbId, p_user_id: auth.user.id, p_budget: requestBudget(),
    });
    if (error || !claim) return empty();
    let departures = claim.departures || [];
    let validUntil = claim.valid_until || null;
    if (claim.should_fetch) {
      try {
        departures = await fetchTitleDepartures(tmdbId);
        const { data: completed, error: writeError } = await admin.rpc("complete_title_departure_fetch", {
          p_tmdb_id: tmdbId, p_token: claim.token, p_departures: departures,
        });
        if (writeError || !completed) throw new Error("Departure cache unavailable");
        validUntil = completed;
      } catch {
        await admin.rpc("fail_title_departure_fetch", { p_tmdb_id: tmdbId, p_token: claim.token });
        return empty();
      }
    }
    return res.status(200).json({
      departures: departures.filter((departure) => matches.includes(departure.service)), validUntil,
    });
  } catch {
    return empty();
  }
}

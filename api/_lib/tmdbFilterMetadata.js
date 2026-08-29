import { extractUsMovieRating } from "../../src/utils/movieRatings.js";
import { normalizeStreamingServices } from "../../src/utils/streamingServices.js";
import { tmdbFetch } from "./tmdb.js";

export function normalizeTmdbFilterMetadata(data, { region = "US", fetchedAt } = {}) {
  const normalizedRegion = String(region || "US").toUpperCase();
  const providerResults = data?.["watch/providers"]?.results || {};
  const regionData = providerResults[normalizedRegion] || {};
  const providers = normalizeStreamingServices([
    ...(regionData.flatrate || []),
    ...(regionData.ads || []),
  ].map((provider) => provider?.provider_name).filter(Boolean));
  const details = { ...(data || {}) };
  delete details["watch/providers"];

  return {
    details,
    certification: extractUsMovieRating(details),
    providers,
    region: normalizedRegion,
    fetchedAt: fetchedAt || new Date().toISOString(),
  };
}

export async function fetchTmdbFilterMetadata(tmdbId, options = {}) {
  const data = await tmdbFetch(
    `/movie/${encodeURIComponent(tmdbId)}?append_to_response=release_dates,watch/providers`,
    { signal: options.signal }
  );
  return normalizeTmdbFilterMetadata(data, options);
}

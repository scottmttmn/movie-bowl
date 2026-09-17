import { extractUsMovieRating } from "../../src/utils/movieRatings.js";
import { normalizeTmdbWatchProviders } from "../../src/utils/tmdbWatchProviders.js";
import { tmdbFetch } from "./tmdb.js";

export function normalizeTmdbFilterMetadata(data, { region = "US", fetchedAt } = {}) {
  const normalizedRegion = String(region || "US").toUpperCase();
  const providerData = normalizeTmdbWatchProviders(data, {
    region: normalizedRegion,
    fetchedAt,
  });
  const details = { ...(data || {}) };
  delete details["watch/providers"];

  return {
    details,
    certification: extractUsMovieRating(details),
    ...providerData,
  };
}

export async function fetchTmdbFilterMetadata(tmdbId, options = {}) {
  const data = await tmdbFetch(
    `/movie/${encodeURIComponent(tmdbId)}?append_to_response=release_dates,watch/providers`,
    { signal: options.signal }
  );
  return normalizeTmdbFilterMetadata(data, options);
}

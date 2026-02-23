import { uniqueNormalizedServices } from "../utils/streamingServices";

const TMDB_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN;

export async function fetchStreamingProviders(tmdbId, options = {}) {
  const region = options.region || "US";

  if (!tmdbId || !TMDB_TOKEN) {
    return { region, providers: [], fetchedAt: null };
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`TMDB providers request failed with ${response.status}`);
    }

    const data = await response.json();
    const regionData = data?.results?.[region] || {};

    const providerNames = [
      ...(regionData.flatrate || []),
      ...(regionData.ads || []),
    ]
      .map((provider) => provider?.provider_name)
      .filter(Boolean);

    return {
      region,
      providers: uniqueNormalizedServices(providerNames),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[streamingProviders] Failed to fetch providers", error);
    return { region, providers: [], fetchedAt: null };
  }
}

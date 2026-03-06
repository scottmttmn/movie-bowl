import { normalizeStreamingServices } from "./streamingServices";

const STREAMING_SERVICE_WEB_SEARCH_URLS = {
  Netflix: (query) => `https://www.netflix.com/search?q=${query}`,
  Hulu: (query) => `https://www.hulu.com/search?q=${query}`,
  "Disney+": (query) => `https://www.disneyplus.com/search/${query}`,
  "Prime Video": (query) => `https://www.amazon.com/s?k=${query}&i=instant-video`,
  Max: (query) => `https://play.max.com/search?q=${query}`,
  "Apple TV+": (query) => `https://tv.apple.com/search?term=${query}`,
  "Paramount+": (query) => `https://www.paramountplus.com/search/?term=${query}`,
  Peacock: (query) => `https://www.peacocktv.com/search?query=${query}`,
};

export function resolvePreferredWebLaunchCandidate({
  userServices = [],
  movieProviders = [],
  title = "",
  year = "",
}) {
  const normalizedUserServices = normalizeStreamingServices(userServices);
  const normalizedProviders = new Set(
    normalizeStreamingServices(movieProviders).map((provider) => provider.toLowerCase())
  );
  const searchText = String(title || "").trim();

  if (!searchText) return null;

  const fullQuery = year ? `${searchText} ${year}` : searchText;
  const encodedQuery = encodeURIComponent(fullQuery);

  for (const serviceName of normalizedUserServices) {
    if (!normalizedProviders.has(serviceName.toLowerCase())) continue;

    const urlBuilder = STREAMING_SERVICE_WEB_SEARCH_URLS[serviceName];
    if (!urlBuilder) continue;

    return {
      serviceName,
      url: urlBuilder(encodedQuery),
    };
  }

  return null;
}

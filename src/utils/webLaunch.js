import { normalizeServiceName, normalizeStreamingServices } from "./streamingServices.js";

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
}) {
  const normalizedUserServices = normalizeStreamingServices(userServices);
  const normalizedProviders = new Set(
    normalizeStreamingServices(movieProviders).map((provider) => provider.toLowerCase())
  );
  const searchText = String(title || "").trim();

  if (!searchText) return null;

  const encodedQuery = encodeURIComponent(searchText);

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

export function safeProviderUrl(value, { native = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (["https:", "http:"].includes(url.protocol)) return url.href;
    if (native && !["javascript:", "data:", "file:", "blob:", "about:", "vbscript:"].includes(url.protocol)) {
      return value;
    }
  } catch { /* Invalid destinations fall back to the service's search URL. */ }
  return null;
}

export function resolvePreferredLaunchTarget({ providerLinks = [], ...options }) {
  const candidate = resolvePreferredWebLaunchCandidate(options);
  if (!candidate) return null;
  const link = (Array.isArray(providerLinks) ? providerLinks : []).find((entry) =>
    normalizeServiceName(entry?.service) === candidate.serviceName &&
    ["sub", "free"].includes(entry?.type) && safeProviderUrl(entry?.webUrl)
  );
  return {
    ...candidate,
    url: link ? safeProviderUrl(link.webUrl) : candidate.url,
    linkType: link ? "title" : "search",
    deepLinks: {
      ios: link ? safeProviderUrl(link.iosUrl, { native: true }) : null,
      android: link ? safeProviderUrl(link.androidUrl, { native: true }) : null,
    },
  };
}

export function buildVoiceHandoffCommand(title, launchTarget) {
  const movieTitle = String(title || "").trim();
  return movieTitle && launchTarget?.serviceName
    ? `Play ${movieTitle} on ${launchTarget.serviceName}` : "";
}

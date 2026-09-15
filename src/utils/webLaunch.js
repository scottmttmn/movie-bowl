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

export const AUTO_START_SURFACE = {
  tvApp: "tv-app",
  desktop: "desktop",
  touch: "touch",
};

// The Google TV shell tags its user agent. Otherwise the primary pointer, not
// the screen width, separates a desktop from a phone: a touchscreen laptop
// still reports a fine pointer, and a wrong guess lands on the button.
export function getAutoStartSurface({ userAgent = "", hasFinePointer = false } = {}) {
  if (/\bMovieBowlTV\//.test(String(userAgent))) return AUTO_START_SURFACE.tvApp;
  return hasFinePointer ? AUTO_START_SURFACE.desktop : AUTO_START_SURFACE.touch;
}

// How the end of a pre-roll opens the feature, or null when it should not. A
// phone gets null because a web link opened by a timer, rather than a tap, stays
// in the browser instead of reaching the installed app. A search link gets null
// everywhere: an unattended room is worse off on a results page than on the
// button.
export function getAutoStartMode({ surface, launchCandidate, launchError = null } = {}) {
  if (launchError) return null;
  if (launchCandidate?.linkType !== "title" || !launchCandidate?.url) return null;
  if (surface === AUTO_START_SURFACE.tvApp) return "window";
  if (surface === AUTO_START_SURFACE.desktop) return "navigate";
  return null;
}

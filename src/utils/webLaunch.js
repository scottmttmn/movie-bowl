import { matchUserServices, normalizeServiceName, normalizeStreamingServices } from "./streamingServices.js";
import { RENTAL_STORES, RENT_FROM_OFF, normalizeRentFrom, normalizeRentalStore } from "./rentalStores.js";

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

// For a movie none of your services carry: one store's rental page, or the
// watch page listing every store when no direct link came back. Its linkType
// is never "title", so getAutoStartMode leaves it alone -- spending money
// always takes a tap.
export function resolveRentTarget({
  providerLinks = [],
  rentFrom,
  watchUrl = null,
  canRent = false,
  userServices = [],
  movieProviders = [],
  availabilityStatus = "ready",
  // Narrows which store links count; the TV passes isTvAppRentalLink.
  acceptLink = () => true,
}) {
  const preference = normalizeRentFrom(rentFrom);
  if (preference === RENT_FROM_OFF) return null;

  // Asking someone to pay needs proof they can't already watch it. A failed
  // availability read is an empty list, not that proof, and either source
  // naming one of their services rules a rental out.
  if (availabilityStatus === "failed") return null;
  if (matchUserServices(movieProviders, userServices).length > 0) return null;
  const links = Array.isArray(providerLinks) ? providerLinks : [];
  const includedServices = links
    .filter((entry) => ["sub", "free"].includes(entry?.type))
    .map((entry) => entry.service);
  if (matchUserServices(includedServices, userServices).length > 0) return null;

  const rentLinks = links.flatMap((entry) => {
    if (entry?.type !== "rent") return [];
    const storeName = normalizeRentalStore(entry.service);
    const url = safeProviderUrl(entry.webUrl);
    return storeName && url && acceptLink({ storeName, url }) ? [{ storeName, url }] : [];
  });
  const order = RENTAL_STORES.includes(preference)
    ? [preference, ...RENTAL_STORES.filter((store) => store !== preference)]
    : RENTAL_STORES;
  for (const storeName of order) {
    const link = rentLinks.find((entry) => entry.storeName === storeName);
    if (link) return { storeName, url: link.url, linkType: "rent" };
  }

  const fallbackUrl = safeProviderUrl(watchUrl);
  return canRent && fallbackUrl ? { storeName: null, url: fallbackUrl, linkType: "rent-options" } : null;
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

// A launch failure with no known destination is assumed to be this one, which
// is how every failure was treated before failures carried a destination.
export function isFailedLaunchUrl(failedUrl, url) {
  if (!failedUrl) return true;
  if (!url) return false;
  try {
    return new URL(failedUrl).href === new URL(url).href;
  } catch {
    return false;
  }
}

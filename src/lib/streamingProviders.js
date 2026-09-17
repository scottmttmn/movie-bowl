import {
  createEmptyStreamingProviderData,
  normalizeStoredProviderData,
  normalizeTmdbWatchProviders,
} from "../utils/tmdbWatchProviders";
import { getTmdbMovieProviders } from "./tmdbApi";

const PROVIDER_CACHE_TTL_MS = 10 * 60 * 1000;
const providersCache = new Map();
const inflightRequests = new Map();

function getCacheKey(tmdbId, region) {
  return `${region}:${tmdbId}`;
}

export function clearStreamingProvidersCache() {
  providersCache.clear();
  inflightRequests.clear();
}

export function primeStreamingProvidersCache(tmdbId, providerData, options = {}) {
  const region = String(options.region || providerData?.region || "US").toUpperCase();
  const numericId = Number(tmdbId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;

  const value = normalizeStoredProviderData(providerData, { region });
  providersCache.set(getCacheKey(numericId, region), {
    value,
    expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
  });
  return value;
}

export async function fetchStreamingProviders(tmdbId, options = {}) {
  const region = String(options.region || "US").toUpperCase();
  const bypassCache = Boolean(options.bypassCache);

  if (!tmdbId) {
    return createEmptyStreamingProviderData(region);
  }

  const cacheKey = getCacheKey(tmdbId, region);
  const now = Date.now();

  if (!bypassCache) {
    const cached = providersCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const inflight = inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const requestPromise = (async () => {
    try {
      const data = await getTmdbMovieProviders(tmdbId, { region });
      const result = normalizeTmdbWatchProviders(data, {
        region,
        fetchedAt: data?.fetchedAt || new Date().toISOString(),
      });

      if (!bypassCache) {
        providersCache.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
        });
      }

      return result;
    } catch (error) {
      console.error("[streamingProviders] Failed to fetch providers", error);
      return createEmptyStreamingProviderData(region, { status: "failed" });
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  if (!bypassCache) {
    inflightRequests.set(cacheKey, requestPromise);
  }

  return requestPromise;
}

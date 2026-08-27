import { getTmdbMovieFilterMetadata } from "./tmdbApi";
import { primeStreamingProvidersCache } from "./streamingProviders";

const FILTER_METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
const filterMetadataCache = new Map();
const inflightRequests = new Map();

export function clearMovieFilterMetadataCache() {
  filterMetadataCache.clear();
  inflightRequests.clear();
}

export async function fetchMovieFilterMetadata(tmdbId) {
  const numericId = Number(tmdbId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return {
      details: {},
      providers: [],
      region: "US",
      fetchedAt: null,
    };
  }

  const now = Date.now();
  const cached = filterMetadataCache.get(numericId);
  if (cached && cached.expiresAt > now) return cached.value;

  const inflight = inflightRequests.get(numericId);
  if (inflight) return inflight;

  const requestPromise = getTmdbMovieFilterMetadata(numericId)
    .then((metadata) => {
      const value = {
        details: metadata?.details || {},
        providers: metadata?.providers || [],
        region: metadata?.region || "US",
        fetchedAt: metadata?.fetchedAt || null,
      };
      filterMetadataCache.set(numericId, {
        value,
        expiresAt: Date.now() + FILTER_METADATA_CACHE_TTL_MS,
      });
      primeStreamingProvidersCache(numericId, value);
      return value;
    })
    .finally(() => {
      inflightRequests.delete(numericId);
    });

  inflightRequests.set(numericId, requestPromise);
  return requestPromise;
}

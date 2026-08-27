/**
 * Shares one combined metadata request between the rating and provider stages.
 * If rating data was already cached, no combined request is started and the
 * provider stage retains its existing cache-aware fetcher instead.
 */
export function createFilterMetadataFetchers({
  shouldCombineMetadata,
  fetchMovieDetails,
  fetchProviders,
  fetchFilterMetadata,
}) {
  const combinedRequests = new Map();

  const getCombinedRequest = (tmdbId) => {
    if (!combinedRequests.has(tmdbId)) {
      combinedRequests.set(tmdbId, Promise.resolve().then(() => fetchFilterMetadata(tmdbId)));
    }
    return combinedRequests.get(tmdbId);
  };

  const movieDetailsFetcher = shouldCombineMetadata
    ? async (tmdbId) => {
        try {
          return (await getCombinedRequest(tmdbId))?.details || {};
        } catch {
          return fetchMovieDetails(tmdbId);
        }
      }
    : fetchMovieDetails;

  const providersFetcher = async (tmdbId) => {
    const combinedRequest = combinedRequests.get(tmdbId);
    if (combinedRequest) {
      try {
        const metadata = await combinedRequest;
        return {
          providers: metadata?.providers || [],
          region: metadata?.region || "US",
          fetchedAt: metadata?.fetchedAt || null,
        };
      } catch {
        // Combined metadata is an optimization. Preserve the existing provider
        // lookup as the correctness fallback when it is unavailable.
      }
    }
    return fetchProviders(tmdbId);
  };

  return { movieDetailsFetcher, providersFetcher };
}

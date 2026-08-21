import { matchUserServices, normalizeStreamingServices } from "./streamingServices";
import { DEFAULT_DRAW_METHOD, getDrawMethod } from "./drawMethods";

export function getMovieFromDrawCandidate(candidate) {
  return candidate?.movie || candidate;
}

export function getProvidersForMovie(movie, fetchProviders) {
  const tmdbId = Number(movie?.tmdb_id);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
    return Promise.resolve({ providers: [], region: "US", fetchedAt: null });
  }
  return fetchProviders(tmdbId);
}

/**
 * Resolves the exact pool left by streaming priority.
 *
 * This is shared by the draw and its transparency readouts. In particular,
 * manual titles cannot match a streaming service, while an empty match set
 * falls back to the whole incoming pool, including those manual titles.
 */
export async function getStreamingPriorityPool(
  movies,
  {
    prioritizeByServiceRank = true,
    userStreamingServices = [],
    fetchProviders,
  } = {}
) {
  const sourceMovies = Array.isArray(movies) ? movies : [];
  const normalizedUserServices = normalizeStreamingServices(userStreamingServices);
  if (sourceMovies.length === 0 || normalizedUserServices.length === 0) {
    return {
      candidates: sourceMovies,
      matchCount: 0,
      topService: null,
      topServiceCount: 0,
    };
  }
  if (typeof fetchProviders !== "function") {
    throw new Error("getStreamingPriorityPool requires fetchProviders");
  }

  const serviceRank = new Map(
    normalizedUserServices.map((service, index) => [service.toLowerCase(), index])
  );
  const candidatesWithProviders = await Promise.all(
    sourceMovies.map(async (movie) => {
      const providerData = await getProvidersForMovie(movie, fetchProviders);
      const providers = providerData?.providers || [];
      const matchedServices = matchUserServices(providers, normalizedUserServices);
      const bestRank = matchedServices.reduce((lowestRank, service) => {
        const rank = serviceRank.get(service.toLowerCase());
        return typeof rank === "number" ? Math.min(lowestRank, rank) : lowestRank;
      }, Number.POSITIVE_INFINITY);

      return {
        movie,
        providers,
        region: providerData?.region || "US",
        fetchedAt: providerData?.fetchedAt || null,
        matchedServices,
        bestRank,
      };
    })
  );
  const matchedCandidates = candidatesWithProviders.filter(
    (candidate) => candidate.matchedServices.length > 0
  );

  if (matchedCandidates.length === 0) {
    return {
      candidates: candidatesWithProviders,
      matchCount: 0,
      topService: null,
      topServiceCount: 0,
    };
  }

  const topRank = matchedCandidates.reduce(
    (lowestRank, candidate) => Math.min(lowestRank, candidate.bestRank),
    Number.POSITIVE_INFINITY
  );
  const topCandidates = matchedCandidates.filter(
    (candidate) => candidate.bestRank === topRank
  );

  return {
    candidates: prioritizeByServiceRank ? topCandidates : matchedCandidates,
    matchCount: matchedCandidates.length,
    topService: normalizedUserServices[topRank] || null,
    topServiceCount: topCandidates.length,
  };
}

/**
 * Applies only the streaming-priority stage and returns the complete pool that
 * the draw method is allowed to use. When priority is off, rows stay raw so a
 * provider lookup is paid only for the eventual selection.
 */
export async function resolveStreamingDrawPool(
  movies,
  {
    prioritizeByServices = false,
    prioritizeByServiceRank = true,
    userStreamingServices = [],
    fetchProviders,
  } = {}
) {
  const sourceMovies = Array.isArray(movies) ? movies : [];
  const normalizedUserServices = normalizeStreamingServices(userStreamingServices);
  const canPrioritize = prioritizeByServices && normalizedUserServices.length > 0;

  if (!canPrioritize) return sourceMovies;

  const { candidates } = await getStreamingPriorityPool(sourceMovies, {
    prioritizeByServiceRank,
    userStreamingServices: normalizedUserServices,
    fetchProviders,
  });
  return candidates;
}

export async function hydrateDrawCandidate(candidate, fetchProviders) {
  if (!candidate) return null;
  if (candidate?.movie) return candidate;

  const providerData = await getProvidersForMovie(candidate, fetchProviders);
  return {
    movie: candidate,
    providers: providerData?.providers || [],
    region: providerData?.region || "US",
    fetchedAt: providerData?.fetchedAt || null,
  };
}

export async function selectFromResolvedDrawPool(
  candidates,
  {
    fetchProviders,
    randomFn = Math.random,
    drawMethod = DEFAULT_DRAW_METHOD,
  } = {}
) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const method = getDrawMethod(drawMethod);
  if (method.selectionMode !== "client") {
    throw new Error(`${method.id} selection requires its atomic draw RPC`);
  }

  const selected = method.pick(candidates, { randomFn });
  return hydrateDrawCandidate(selected, fetchProviders);
}

export async function selectDrawCandidate(
  remainingMovies,
  {
    prioritizeByServices = false,
    prioritizeByServiceRank = true,
    userStreamingServices = [],
    fetchProviders,
    randomFn = Math.random,
    drawMethod = DEFAULT_DRAW_METHOD,
  } = {}
) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) return null;

  if (typeof fetchProviders !== "function") {
    throw new Error("selectDrawCandidate requires fetchProviders");
  }

  const drawPool = await resolveStreamingDrawPool(remainingMovies, {
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
    fetchProviders,
  });

  // The bowl's method replaces only the final pick. It runs on whatever pool
  // survives streaming priority, so the two stay composable.
  return selectFromResolvedDrawPool(drawPool, {
    fetchProviders,
    randomFn,
    drawMethod,
  });
}

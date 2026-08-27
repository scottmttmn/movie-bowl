import {
  getDrawCandidates,
  getLocallyFilteredCandidates,
  isRatingFilterExhaustive,
} from "./drawSelection";
import { matchUserServices, normalizeStreamingServices } from "./streamingServices";
import { createFilterMetadataFetchers } from "./filterMetadataFetchers";

export const ELIGIBILITY_LOOKUP_BATCH_SIZE = 6;

function getPositiveTmdbId(movie) {
  const tmdbId = Number(movie?.tmdb_id);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

function getCandidateBestRank(movie, providerData, services, serviceRank) {
  const matchedServices = matchUserServices(providerData?.providers || [], services);
  const bestRank = matchedServices.reduce((lowestRank, service) => {
    const rank = serviceRank.get(service.toLowerCase());
    return typeof rank === "number" ? Math.min(lowestRank, rank) : lowestRank;
  }, Number.POSITIVE_INFINITY);

  return { movie, bestRank };
}

async function mapWithConcurrency(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  const runnerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function resolveProviderRanks(movies, {
  services,
  serviceRank,
  fetchProviders,
  batchSize,
}) {
  return mapWithConcurrency(
    movies,
    async (movie) => {
      const tmdbId = getPositiveTmdbId(movie);
      const providerData = tmdbId
        ? await fetchProviders(tmdbId)
        : { providers: [], region: "US", fetchedAt: null };
      return getCandidateBestRank(movie, providerData, services, serviceRank);
    },
    batchSize
  );
}

async function scanOtherMoviesForBetterMatch({
  movies,
  targetRank,
  ratingFilter,
  fetchMovieDetails,
  fetchProviders,
  services,
  serviceRank,
  batchSize,
}) {
  for (let index = 0; index < movies.length; index += batchSize) {
    const batch = movies.slice(index, index + batchSize);
    const { candidates } = await getDrawCandidates({
      remainingMovies: batch,
      ratingFilter,
      fetchMovieDetails,
      ratingLast: true,
    });
    const rankedCandidates = await resolveProviderRanks(candidates, {
      services,
      serviceRank,
      fetchProviders,
      batchSize,
    });
    if (rankedCandidates.some((candidate) => candidate.bestRank < targetRank)) return true;
  }
  return false;
}

/**
 * Resolves only the current user's membership in the exact draw pool. Streaming
 * priority is global, but we can stop scanning the rest of the bowl as soon as
 * another movie proves every owned candidate is excluded.
 */
export async function resolveMyMovieEligibility({
  remainingMovies = [],
  myMovieIds = [],
  prioritizeByServices = false,
  prioritizeByServiceRank = true,
  userStreamingServices = [],
  ratingFilter = null,
  genreFilter = null,
  runtimeFilter = null,
  fetchMovieDetails,
  fetchProviders,
  fetchFilterMetadata,
  batchSize = ELIGIBILITY_LOOKUP_BATCH_SIZE,
}) {
  const myIdSet = new Set((myMovieIds || []).map((id) => String(id)));
  const persistedMovies = (remainingMovies || []).filter(
    (movie) => movie && movie.local_status !== "syncing"
  );
  const myMovies = persistedMovies.filter((movie) => myIdSet.has(String(movie.id)));
  const otherMovies = persistedMovies.filter((movie) => !myIdSet.has(String(movie.id)));
  const localFilters = { genreFilter, runtimeFilter };
  const locallyEligibleMyMovies = getLocallyFilteredCandidates(myMovies, localFilters);
  const locallyEligibleOtherMovies = getLocallyFilteredCandidates(otherMovies, localFilters);
  const ratingFilterForEligibility = isRatingFilterExhaustive(ratingFilter)
    ? null
    : ratingFilter;
  const services = normalizeStreamingServices(userStreamingServices);
  const canPrioritizeStreaming = prioritizeByServices && services.length > 0;
  const shouldCombineMetadata = Boolean(
    ratingFilterForEligibility &&
      canPrioritizeStreaming &&
      typeof fetchFilterMetadata === "function"
  );
  const { movieDetailsFetcher, providersFetcher } = createFilterMetadataFetchers({
    shouldCombineMetadata,
    fetchMovieDetails,
    fetchProviders,
    fetchFilterMetadata,
  });

  const { candidates: ordinaryEligibleMyMovies } = await getDrawCandidates({
    remainingMovies: locallyEligibleMyMovies,
    ratingFilter: ratingFilterForEligibility,
    fetchMovieDetails: movieDetailsFetcher,
    ratingLast: true,
  });

  if (!canPrioritizeStreaming || ordinaryEligibleMyMovies.length === 0) {
    return ordinaryEligibleMyMovies.map((movie) => movie.id);
  }

  const serviceRank = new Map(
    services.map((service, index) => [service.toLowerCase(), index])
  );
  const rankedMyMovies = await resolveProviderRanks(ordinaryEligibleMyMovies, {
    services,
    serviceRank,
    fetchProviders: providersFetcher,
    batchSize,
  });

  if (!prioritizeByServiceRank) {
    const matchedMyMovies = rankedMyMovies.filter(
      (candidate) => Number.isFinite(candidate.bestRank)
    );
    if (matchedMyMovies.length > 0) {
      return matchedMyMovies.map((candidate) => candidate.movie.id);
    }

    const anotherMovieMatches = await scanOtherMoviesForBetterMatch({
      movies: locallyEligibleOtherMovies,
      targetRank: Number.POSITIVE_INFINITY,
      ratingFilter: ratingFilterForEligibility,
      fetchMovieDetails: movieDetailsFetcher,
      fetchProviders: providersFetcher,
      services,
      serviceRank,
      batchSize,
    });
    return anotherMovieMatches ? [] : ordinaryEligibleMyMovies.map((movie) => movie.id);
  }

  const bestOwnedRank = rankedMyMovies.reduce(
    (bestRank, candidate) => Math.min(bestRank, candidate.bestRank),
    Number.POSITIVE_INFINITY
  );
  if (bestOwnedRank === 0) {
    return rankedMyMovies
      .filter((candidate) => candidate.bestRank === 0)
      .map((candidate) => candidate.movie.id);
  }

  const anotherMovieRanksHigher = await scanOtherMoviesForBetterMatch({
    movies: locallyEligibleOtherMovies,
    targetRank: bestOwnedRank,
    ratingFilter: ratingFilterForEligibility,
    fetchMovieDetails: movieDetailsFetcher,
    fetchProviders: providersFetcher,
    services,
    serviceRank,
    batchSize,
  });
  if (anotherMovieRanksHigher) return [];

  if (!Number.isFinite(bestOwnedRank)) {
    return ordinaryEligibleMyMovies.map((movie) => movie.id);
  }
  return rankedMyMovies
    .filter((candidate) => candidate.bestRank === bestOwnedRank)
    .map((candidate) => candidate.movie.id);
}

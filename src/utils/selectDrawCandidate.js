import { matchUserServices, normalizeStreamingServices } from "./streamingServices";
import { getContributorBucketKey } from "./drawBuckets";

export async function selectDrawCandidate(
  remainingMovies,
  {
    prioritizeByServices = false,
    prioritizeByServiceRank = true,
    userStreamingServices = [],
    fetchProviders,
    randomFn = Math.random,
  } = {}
) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) return null;

  if (typeof fetchProviders !== "function") {
    throw new Error("selectDrawCandidate requires fetchProviders");
  }

  const normalizedUserServices = normalizeStreamingServices(userStreamingServices);
  const canPrioritize = prioritizeByServices && normalizedUserServices.length > 0;
  const serviceRank = new Map(
    normalizedUserServices.map((service, index) => [service.toLowerCase(), index])
  );

  const pickRandom = (items) => {
    const index = Math.floor(randomFn() * items.length);
    return items[index];
  };
  const pickRandomByContributor = (items) => {
    const buckets = new Map();
    items.forEach((item) => {
      const movie = item?.movie || item;
      const bucketKey = getContributorBucketKey(movie);
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
      buckets.get(bucketKey).push(item);
    });

    const bucketList = Array.from(buckets.values()).filter((bucket) => bucket.length > 0);
    const bucket = pickRandom(bucketList);
    return pickRandom(bucket);
  };
  const getProvidersForMovie = async (movie) => {
    const tmdbId = Number(movie?.tmdb_id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
      return { providers: [], region: "US", fetchedAt: null };
    }
    return fetchProviders(tmdbId);
  };

  if (!canPrioritize) {
    const movie = pickRandomByContributor(remainingMovies);
    const providerData = await getProvidersForMovie(movie);
    return {
      movie,
      providers: providerData?.providers || [],
      region: providerData?.region || "US",
      fetchedAt: providerData?.fetchedAt || null,
    };
  }

  const candidatesWithProviders = await Promise.all(
    remainingMovies.map(async (movie) => {
      const providerData = await getProvidersForMovie(movie);
      const providers = providerData?.providers || [];
      return {
        movie,
        providers,
        region: providerData?.region || "US",
        fetchedAt: providerData?.fetchedAt || null,
        matchedServices: matchUserServices(providers, normalizedUserServices),
      };
    })
  );

  const rankedCandidates = candidatesWithProviders
    .map((candidate) => {
      const bestRank = candidate.matchedServices.reduce((lowestRank, service) => {
        const rank = serviceRank.get(service.toLowerCase());
        if (typeof rank !== "number") return lowestRank;
        return Math.min(lowestRank, rank);
      }, Number.POSITIVE_INFINITY);

      return {
        ...candidate,
        bestRank,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.bestRank));

  const drawPool = (() => {
    if (!prioritizeByServiceRank) {
      const matchedCandidates = candidatesWithProviders.filter(
        (candidate) => candidate.matchedServices.length > 0
      );
      return matchedCandidates.length > 0 ? matchedCandidates : candidatesWithProviders;
    }

    if (rankedCandidates.length === 0) return candidatesWithProviders;
    const topRank = rankedCandidates.reduce(
      (lowestRank, candidate) => Math.min(lowestRank, candidate.bestRank),
      Number.POSITIVE_INFINITY
    );
    return rankedCandidates.filter((candidate) => candidate.bestRank === topRank);
  })();

  return pickRandomByContributor(drawPool);
}

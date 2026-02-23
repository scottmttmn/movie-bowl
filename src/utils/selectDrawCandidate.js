import { matchUserServices, normalizeStreamingServices } from "./streamingServices";

export async function selectDrawCandidate(
  remainingMovies,
  {
    prioritizeByServices = false,
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

  const pickRandom = (items) => {
    const index = Math.floor(randomFn() * items.length);
    return items[index];
  };

  if (!canPrioritize) {
    const movie = pickRandom(remainingMovies);
    const providerData = await fetchProviders(movie.tmdb_id);
    return {
      movie,
      providers: providerData?.providers || [],
      region: providerData?.region || "US",
      fetchedAt: providerData?.fetchedAt || null,
    };
  }

  const candidatesWithProviders = await Promise.all(
    remainingMovies.map(async (movie) => {
      const providerData = await fetchProviders(movie.tmdb_id);
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

  const matchedCandidates = candidatesWithProviders.filter(
    (candidate) => candidate.matchedServices.length > 0
  );
  const drawPool = matchedCandidates.length > 0 ? matchedCandidates : candidatesWithProviders;
  return pickRandom(drawPool);
}

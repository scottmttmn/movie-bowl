import { selectDrawCandidate } from "./selectDrawCandidate";
import { extractUsMovieRating, normalizeMpaaRating } from "./movieRatings";

const MOVIE_RATING_CACHE_TTL_MS = 60 * 60 * 1000;
const movieRatingCache = new Map();

export function clearDrawSelectionCache() {
  movieRatingCache.clear();
}

async function getCachedMovieRating(tmdbId, fetchMovieDetails) {
  const now = Date.now();
  const cached = movieRatingCache.get(tmdbId);
  if (cached && cached.expiresAt > now) return cached.rating;

  try {
    const details = await fetchMovieDetails(tmdbId);
    const rating = extractUsMovieRating(details);
    movieRatingCache.set(tmdbId, {
      rating,
      expiresAt: now + MOVIE_RATING_CACHE_TTL_MS,
    });
    return rating;
  } catch (error) {
    console.error("[drawSelection] Failed to fetch movie rating", error);
    movieRatingCache.set(tmdbId, {
      rating: null,
      expiresAt: now + 5 * 60 * 1000,
    });
    return null;
  }
}

async function filterCandidatesByRating(movies, ratingFilter, fetchMovieDetails) {
  const normalizedAllowedRatings = new Set(
    (ratingFilter.allowedRatings || [])
      .map((rating) => normalizeMpaaRating(rating))
      .filter(Boolean)
  );
  const includeUnknownRatings = ratingFilter.includeUnknown !== false;

  const ratedCandidates = await Promise.all(
    movies.map(async (movie) => {
      const tmdbId = Number(movie?.tmdb_id);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
        return { movie, rating: null };
      }
      return {
        movie,
        rating: await getCachedMovieRating(tmdbId, fetchMovieDetails),
      };
    })
  );

  return ratedCandidates
    .filter(({ rating }) => {
      if (!rating) return includeUnknownRatings;
      return normalizedAllowedRatings.has(rating);
    })
    .map(({ movie }) => movie);
}

function filterCandidatesByRuntime(movies, runtimeFilter) {
  const mode = runtimeFilter.mode === "min" ? "min" : "max";
  const threshold = Number(runtimeFilter.threshold);
  const includeUnknownRuntime = runtimeFilter.includeUnknown !== false;
  if (!Number.isFinite(threshold) || threshold <= 0) return movies;

  return movies.filter((movie) => {
    const runtime = Number(movie?.runtime);
    if (!Number.isFinite(runtime) || runtime <= 0) {
      return includeUnknownRuntime;
    }
    if (mode === "min") return runtime >= threshold;
    return runtime <= threshold;
  });
}

export async function getDrawSelection({
  remainingMovies,
  prioritizeByServices = false,
  prioritizeByServiceRank = true,
  userStreamingServices = [],
  ratingFilter = null,
  runtimeFilter = null,
  fetchProviders,
  fetchMovieDetails,
}) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) {
    return { selected: null, errorMessage: null };
  }

  let drawCandidates = remainingMovies;
  if (ratingFilter) {
    drawCandidates = await filterCandidatesByRating(
      remainingMovies,
      ratingFilter,
      fetchMovieDetails
    );
    if (drawCandidates.length === 0) {
      return {
        selected: null,
        errorMessage: "No titles match your selected ratings. Check your filters.",
      };
    }
  }

  if (runtimeFilter) {
    drawCandidates = filterCandidatesByRuntime(drawCandidates, runtimeFilter);
    if (drawCandidates.length === 0) {
      return {
        selected: null,
        errorMessage: "No titles match your runtime filter. Check your filters.",
      };
    }
  }

  const selected = await selectDrawCandidate(drawCandidates, {
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
    fetchProviders,
  });

  return { selected, errorMessage: null };
}

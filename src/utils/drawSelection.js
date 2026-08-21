import {
  resolveStreamingDrawPool,
  selectFromResolvedDrawPool,
} from "./selectDrawCandidate";
import { extractUsMovieRating, MPAA_RATING_OPTIONS, normalizeMpaaRating } from "./movieRatings";

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
  const minRuntime = Number(runtimeFilter.minMinutes);
  const maxRuntime = Number(runtimeFilter.maxMinutes);
  const includeUnknownRuntime = runtimeFilter.includeUnknown !== false;
  if (!Number.isFinite(minRuntime) || !Number.isFinite(maxRuntime) || minRuntime < 0 || maxRuntime <= 0) {
    return movies;
  }
  const lowerBound = Math.min(minRuntime, maxRuntime);
  const upperBound = Math.max(minRuntime, maxRuntime);

  return movies.filter((movie) => {
    const runtime = Number(movie?.runtime);
    if (!Number.isFinite(runtime) || runtime <= 0) {
      return includeUnknownRuntime;
    }
    return runtime >= lowerBound && runtime <= upperBound;
  });
}

function normalizeGenresFromMovie(movie) {
  if (!Array.isArray(movie?.genres)) return [];
  return movie.genres
    .map((genre) => {
      if (typeof genre === "string") return genre.trim().toLowerCase();
      if (genre?.name) return String(genre.name).trim().toLowerCase();
      return "";
    })
    .filter(Boolean);
}

function filterCandidatesByGenre(movies, genreFilter) {
  const normalizedAllowedGenres = new Set(
    (genreFilter.allowedGenres || [])
      .map((genre) => String(genre).trim().toLowerCase())
      .filter(Boolean)
  );
  const includeUnknownGenres = genreFilter.includeUnknown !== false;

  return movies.filter((movie) => {
    const genres = normalizeGenresFromMovie(movie);
    if (genres.length === 0) return includeUnknownGenres;
    if (normalizedAllowedGenres.size === 0) return false;
    return genres.some((genre) => normalizedAllowedGenres.has(genre));
  });
}

// A rating filter that allows every rating and keeps unknowns cannot remove
// anything, so callers can skip the stage entirely — and with it one TMDB
// lookup per title. This is the default state of the draw filters, which is
// why the pool count is free for most bowls.
export function isRatingFilterExhaustive(ratingFilter) {
  if (!ratingFilter) return true;
  if (ratingFilter.includeUnknown === false) return false;

  const allowed = new Set(
    (ratingFilter.allowedRatings || [])
      .map((rating) => normalizeMpaaRating(rating))
      .filter(Boolean)
  );
  return MPAA_RATING_OPTIONS.every((rating) => allowed.has(rating));
}

/**
 * Applies the draw filters and returns the surviving pool.
 *
 * The filters are conjunctive, so the surviving set never depends on the order
 * they run in — only on which message a user sees when one of them empties the
 * pool. `getDrawSelection` keeps rating first so that message stays what it has
 * always been; `ratingLast` exists for the pool count, which has no messages to
 * preserve and wants the free row-local filters to shrink the set before it
 * pays a TMDB lookup per surviving title.
 */
export async function getDrawCandidates({
  remainingMovies,
  ratingFilter = null,
  genreFilter = null,
  runtimeFilter = null,
  fetchMovieDetails,
  ratingLast = false,
}) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) {
    return { candidates: [], errorMessage: null };
  }

  const ratingStage = ratingFilter && {
    errorMessage: "No titles match your selected ratings. Check your filters.",
    run: (movies) => filterCandidatesByRating(movies, ratingFilter, fetchMovieDetails),
  };
  const cheapStages = [
    genreFilter && {
      errorMessage: "No titles match your genre filter. Check your filters.",
      run: (movies) => filterCandidatesByGenre(movies, genreFilter),
    },
    runtimeFilter && {
      errorMessage: "No titles match your runtime filter. Check your filters.",
      run: (movies) => filterCandidatesByRuntime(movies, runtimeFilter),
    },
  ].filter(Boolean);

  const stages = (
    ratingLast ? [...cheapStages, ratingStage] : [ratingStage, ...cheapStages]
  ).filter(Boolean);

  let candidates = remainingMovies;
  for (const stage of stages) {
    candidates = await stage.run(candidates);
    if (candidates.length === 0) {
      return { candidates: [], errorMessage: stage.errorMessage };
    }
  }

  return { candidates, errorMessage: null };
}

export async function getDrawSelection({
  remainingMovies,
  prioritizeByServices = false,
  prioritizeByServiceRank = true,
  userStreamingServices = [],
  ratingFilter = null,
  genreFilter = null,
  runtimeFilter = null,
  fetchProviders,
  fetchMovieDetails,
  randomFn,
  drawMethod,
}) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) {
    return { selected: null, errorMessage: null };
  }

  const { candidates, errorMessage } = await getResolvedDrawPool({
    remainingMovies,
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
    ratingFilter,
    genreFilter,
    runtimeFilter,
    fetchProviders,
    fetchMovieDetails,
  });
  if (errorMessage) {
    return { selected: null, errorMessage };
  }

  const selected = await selectFromResolvedDrawPool(candidates, {
    fetchProviders,
    randomFn,
    drawMethod,
  });

  return { selected, errorMessage: null };
}

/**
 * Resolves the complete pool a draw method may use. Ordinary filters run first,
 * then streaming priority, matching both the persisted draw and its readouts.
 */
export async function getResolvedDrawPool({
  remainingMovies,
  prioritizeByServices = false,
  prioritizeByServiceRank = true,
  userStreamingServices = [],
  ratingFilter = null,
  genreFilter = null,
  runtimeFilter = null,
  fetchProviders,
  fetchMovieDetails,
}) {
  if (!Array.isArray(remainingMovies) || remainingMovies.length === 0) {
    return { candidates: [], errorMessage: null };
  }

  const { candidates: filteredCandidates, errorMessage } = await getDrawCandidates({
    remainingMovies,
    ratingFilter,
    genreFilter,
    runtimeFilter,
    fetchMovieDetails,
  });
  if (errorMessage) return { candidates: [], errorMessage };

  const candidates = await resolveStreamingDrawPool(filteredCandidates, {
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
    fetchProviders,
  });

  return { candidates, errorMessage: null };
}

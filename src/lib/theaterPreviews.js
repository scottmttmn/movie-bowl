import { getTmdbMovieDetails } from "./tmdbApi";
import { getDrawablePoolMovies } from "../utils/drawPool";
import { getResolvedDrawPool } from "../utils/drawSelection";
import { getMovieFromDrawCandidate } from "../utils/selectDrawCandidate";

/**
 * The two lookups a pre-roll needs, shared by the television and the dashboard
 * so both surfaces resolve previews the same way.
 *
 * Both swallow their failures on purpose. A pre-roll is an embellishment on a
 * draw that has already happened, so losing the previews entirely -- or worse,
 * failing the draw around them -- costs more than showing a slightly worse set.
 */

/**
 * The ids tonight's settings could still reach, so previews lead with titles
 * that are genuinely still in play. Returns null when the pool cannot be
 * resolved, which `buildTrailerQueue` reads as "rank nothing" and falls back to
 * the whole bowl rather than losing the pre-roll.
 */
export async function resolveEligiblePreviewIds({ movies, drawOptions, fetchers }) {
  try {
    const { candidates } = await getResolvedDrawPool({
      remainingMovies: getDrawablePoolMovies(movies),
      ...drawOptions,
      fetchMovieDetails: fetchers?.fetchMovieDetails,
      fetchProviders: fetchers?.fetchProviders,
      fetchFilterMetadata: fetchers?.fetchFilterMetadata,
    });
    return candidates
      .map((candidate) => getMovieFromDrawCandidate(candidate)?.id)
      .filter(Boolean);
  } catch (error) {
    console.error("[theaterPreviews] Failed to resolve the eligible preview pool", error);
    return null;
  }
}

export async function fetchMovieTrailer(movie) {
  try {
    const details = await getTmdbMovieDetails(Number(movie?.tmdb_id));
    return details?.trailer || null;
  } catch (error) {
    console.error("[theaterPreviews] Failed to load a preview trailer", error);
    return null;
  }
}

import { getContributorBucketKey, getMovieAttributionLabel } from "./drawBuckets";

// The draw is only ever run on rows that have persisted, so anything still
// syncing is not part of the pool the counts describe.
export function getDrawablePoolMovies(movies = []) {
  return (movies || []).filter((movie) => movie && movie.local_status !== "syncing");
}

/**
 * Compares the contributors present in the whole bowl against the ones still
 * represented in the filtered pool.
 *
 * Person-first bucketing gives every contributor the same odds, but only among
 * the contributors the draw can still reach — a filter that removes all of
 * someone's titles removes them from the draw entirely. That is invisible from
 * the bowl list, so the surfaces that promise equal odds report this alongside.
 */
export function summarizeContributorReach(poolMovies = [], candidates = []) {
  const reachedKeys = new Set(
    (candidates || []).map((candidate) => getContributorBucketKey(candidate))
  );

  const labelsByKey = new Map();
  (poolMovies || []).forEach((movie) => {
    const key = getContributorBucketKey(movie);
    // First non-empty label wins: a contributor's rows all resolve to the same
    // person, but only some of them may carry a display name.
    if (!labelsByKey.get(key)) labelsByKey.set(key, getMovieAttributionLabel(movie));
  });

  const excluded = [];
  labelsByKey.forEach((label, key) => {
    if (reachedKeys.has(key)) return;
    excluded.push({ bucketKey: key, name: label || null });
  });

  return {
    totalCount: labelsByKey.size,
    reachedCount: labelsByKey.size - excluded.length,
    // Unnamed contributors still count as excluded; they just cannot be listed.
    excludedNames: excluded
      .map((contributor) => contributor.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  };
}

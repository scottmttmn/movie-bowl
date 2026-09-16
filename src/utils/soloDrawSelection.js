import { getMovieFromDrawCandidate } from "./selectDrawCandidate";

function getPositiveTmdbId(movie) {
  const tmdbId = Number(movie?.tmdb_id);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

// Custom titles carry a negative synthetic tmdb_id, so they cannot be grouped
// by identity at all. Matching them by title would have to decide whether two
// people's "Home Movies" are the same film, and getting that wrong silently
// removes one of them from the draw. They stay distinct per row instead.
function getSoloGroupKey(movie) {
  const tmdbId = getPositiveTmdbId(movie);
  return tmdbId === null ? `row:${movie?.id}` : `tmdb:${tmdbId}`;
}

function compareRowIds(left, right) {
  const leftId = String(left?.id ?? "");
  const rightId = String(right?.id ?? "");
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}

/**
 * Collapses a resolved solo pool into the distinct titles a draw chooses among.
 *
 * One person's own titles are the whole pool here, so the group draw's
 * contributor bucketing has nothing to bucket. What replaces it is this: a
 * movie you put in four bowls is one movie, and holding four slips of it must
 * not make it four times as likely. That is the same promise person-first makes
 * about people, kept one level down.
 *
 * Candidates may be raw rows or `{ movie, providers }` wrappers, depending on
 * whether streaming priority ran, so each group keeps the candidate it came
 * from and returns that untouched. The representative is the lowest row id:
 * stable across draws and independent of the order the rows arrived in, so a
 * repeat pick shows the same note and the same source row every time.
 */
export function groupSoloCandidatesByTitle(candidates) {
  const groups = new Map();

  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    const movie = getMovieFromDrawCandidate(candidate);
    if (!movie?.id) return;

    const key = getSoloGroupKey(movie);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        candidate,
        movie,
        isPinned: Boolean(movie.is_pinned),
        copyCount: 1,
      });
      return;
    }

    existing.copyCount += 1;
    // A title pinned in any bowl in scope is pinned for the draw: the pin is a
    // statement about the movie, and which copy carries it is an accident of
    // where you were standing when you pinned it.
    existing.isPinned = existing.isPinned || Boolean(movie.is_pinned);

    if (compareRowIds(movie, existing.movie) < 0) {
      existing.candidate = candidate;
      existing.movie = movie;
    }
  });

  return [...groups.values()];
}

/**
 * Pins narrow the pool, they do not weight it.
 *
 * Every pinned title gets the same chance, and pinning the same movie in three
 * bowls buys nothing — it is already one title by the time this runs. With
 * nothing pinned the whole pool plays, which is also what happens when the
 * filters excluded every pinned copy: a pin cannot reach past the filters to
 * put a title back.
 */
export function getSoloDrawGroups(candidates) {
  const groups = groupSoloCandidatesByTitle(candidates);
  const pinnedGroups = groups.filter((group) => group.isPinned);
  return pinnedGroups.length > 0 ? pinnedGroups : groups;
}

/**
 * Adapts the cross-bowl solo pool to the bowl theater queue.
 *
 * The queue ranks row ids, while solo selection works with distinct title
 * groups and lets eligible pins narrow the final choice. Translate those
 * title-level rules back to one stable representative row per title so the
 * shared queue can keep doing its ordinary ranking. The feature is excluded by
 * title identity, not just by source row, because another bowl may hold a copy
 * of the same movie.
 */
export function buildSoloPreviewPool(
  movies,
  { eligibleMovieIds = null, excludeMovie = null } = {}
) {
  const rows = Array.isArray(movies) ? movies : [];
  const excluded = getMovieFromDrawCandidate(excludeMovie);
  const excludedKey = excluded?.id ? getSoloGroupKey(excluded) : null;
  const previewGroups = groupSoloCandidatesByTitle(rows).filter(
    (group) => group.key !== excludedKey
  );

  if (!Array.isArray(eligibleMovieIds)) {
    return {
      movies: previewGroups.map((group) => group.movie),
      eligibleMovieIds: null,
    };
  }

  const eligibleIds = new Set(eligibleMovieIds.map(String));
  const eligibleRows = rows.filter((movie) => eligibleIds.has(String(movie?.id)));
  const drawableKeys = new Set(getSoloDrawGroups(eligibleRows).map((group) => group.key));

  return {
    movies: previewGroups.map((group) => group.movie),
    eligibleMovieIds: previewGroups
      .filter((group) => drawableKeys.has(group.key))
      .map((group) => group.movie.id),
  };
}

/**
 * Picks one title uniformly from the groups a solo draw may use.
 *
 * Returns the chosen candidate exactly as it arrived — wrapper or raw row — so
 * the caller can read its providers if streaming priority resolved them.
 */
export function selectSoloDrawCandidate(candidates, { randomFn = Math.random } = {}) {
  const groups = getSoloDrawGroups(candidates);
  if (groups.length === 0) return null;

  const index = Math.floor(randomFn() * groups.length);
  const boundedIndex = Math.min(Math.max(index, 0), groups.length - 1);
  return groups[boundedIndex].candidate;
}

/**
 * Counts the slips each bowl contributes to the unfiltered pool, for the scope
 * selector. These are slips rather than distinct titles: the number answers
 * "what does adding this bowl bring in", and the same movie in two selected
 * bowls really is two rows being read and filtered.
 */
export function getSoloScopeCounts(rows) {
  const counts = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.bowl_id) return;
    counts.set(row.bowl_id, (counts.get(row.bowl_id) || 0) + 1);
  });

  return counts;
}

/**
 * Narrows the pool to the selected bowls. A null or empty scope selects
 * nothing, which the screen reports as "Choose at least one bowl" rather than
 * quietly drawing from everything.
 */
export function filterSoloPoolByScope(rows, selectedBowlIds) {
  const scope = new Set(selectedBowlIds || []);
  if (scope.size === 0) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => scope.has(row?.bowl_id));
}

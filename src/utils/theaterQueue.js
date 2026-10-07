import { clampTheaterTrailerCount } from "./drawSettings";

const RECENT_TRAILER_STORAGE_KEY = "movie-bowl:tv:recent-trailers";

// Roughly two full movie nights of previews, so a trailer only comes back
// around once the bowl's usable trailer pool has had a chance to cycle.
const RECENT_TRAILER_LIMIT = 40;

function getPositiveTmdbId(value) {
  const tmdbId = Number(value);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

// Each entry remembers the movie as well as the trailer, so the queue can put
// unplayed movies first before it looks anything up. Entries from before that
// carry only the trailer key; they still mark the trailer as a repeat once it
// is fetched, they just cannot reorder the list.
function toRecentEntry(value) {
  if (typeof value === "string") return value ? { key: value, tmdbId: null } : null;
  if (!value || typeof value.key !== "string" || !value.key) return null;
  return { key: value.key, tmdbId: getPositiveTmdbId(value.tmdbId) };
}

/** The trailers this device played, most recent first. */
export function readRecentTrailers() {
  try {
    const raw = window.localStorage.getItem(RECENT_TRAILER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(toRecentEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Records a queue as just played. Takes the entries `buildTrailerQueue` returns. */
export function rememberTrailers(queue) {
  const incoming = [];
  const incomingKeys = new Set();
  (queue || []).forEach((entry) => {
    const key = entry?.trailer?.key ? String(entry.trailer.key) : "";
    if (!key || incomingKeys.has(key)) return;
    incomingKeys.add(key);
    incoming.push({ key, tmdbId: getPositiveTmdbId(entry.tmdbId) });
  });
  if (incoming.length === 0) return readRecentTrailers();
  // The queue plays first to last, so its last entry is the most recent.
  incoming.reverse();

  const retained = readRecentTrailers().filter((entry) => !incomingKeys.has(entry.key));
  const next = [...incoming, ...retained].slice(0, RECENT_TRAILER_LIMIT);

  try {
    window.localStorage.setItem(RECENT_TRAILER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A television browser with storage disabled just loses repeat tracking.
  }

  return next;
}

export function shuffle(items, random = Math.random) {
  const copy = [...(items || [])];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function toIdSet(ids) {
  return Array.isArray(ids) ? new Set(ids.map((id) => String(id))) : null;
}

// Two preferences order the queue and they can disagree, so eligibility wins:
// a title the draw can no longer reach is not a preview of anything, while a
// repeat is only a small loss of novelty.
function getEntryRank({ isDrawable, isRepeat }) {
  return (isDrawable ? 0 : 2) + (isRepeat ? 1 : 0);
}

// Position in the recent list by movie, 0 for the most recently played.
function getPlayedIndexByTmdbId(recentTrailers) {
  const indexes = new Map();
  (recentTrailers || []).forEach((entry, index) => {
    if (entry?.tmdbId && !indexes.has(entry.tmdbId)) indexes.set(entry.tmdbId, index);
  });
  return indexes;
}

/**
 * Orders the movies a pre-roll may preview, best first: titles the draw can
 * still reach ahead of the rest of the bowl, and within each, movies whose
 * trailer this device has not played (shuffled) ahead of the ones it has
 * (longest ago first). Each candidate carries the rank it is expected to earn,
 * which is what lets `buildTrailerQueue` stop looking early.
 */
export function selectTrailerCandidates(
  movies,
  { excludeMovieId, eligibleMovieIds = null, recentTrailers = [], random } = {}
) {
  // Custom entries carry a negative synthetic tmdb_id and have no TMDB videos.
  const playable = (movies || []).filter(
    (movie) => movie && movie.id !== excludeMovieId && getPositiveTmdbId(movie.tmdb_id)
  );

  const drawable = toIdSet(eligibleMovieIds);
  const playedIndexes = getPlayedIndexByTmdbId(recentTrailers);

  return shuffle(playable, random)
    .map((movie) => {
      const playedIndex = playedIndexes.get(getPositiveTmdbId(movie.tmdb_id));
      return {
        movie,
        playedIndex: playedIndex ?? -1,
        expectedRank: getEntryRank({
          isDrawable: !drawable || drawable.has(String(movie.id)),
          isRepeat: playedIndex !== undefined,
        }),
      };
    })
    // Sort is stable, so unplayed movies keep their shuffled order.
    .sort(
      (first, second) =>
        first.expectedRank - second.expectedRank || second.playedIndex - first.playedIndex
    )
    .map(({ movie, expectedRank }) => ({ movie, expectedRank }));
}

/**
 * Resolves up to `count` playable previews from the movies still in the bowl.
 * `eligibleMovieIds` is the pool the draw resolved for tonight's settings and
 * `recentTrailers` is what this device played lately (`readRecentTrailers`);
 * titles outside the pool, and trailers played recently, are only used once
 * the better candidates are exhausted.
 */
export async function buildTrailerQueue({
  movies,
  eligibleMovieIds = null,
  excludeMovieId,
  count,
  recentTrailers = [],
  fetchTrailer,
  random,
}) {
  const wanted = clampTheaterTrailerCount(count);
  const candidates = selectTrailerCandidates(movies, {
    excludeMovieId,
    eligibleMovieIds,
    recentTrailers,
    random,
  });
  if (candidates.length === 0 || typeof fetchTrailer !== "function") return [];

  const recentKeys = new Set((recentTrailers || []).map((entry) => entry?.key).filter(Boolean));
  const drawable = toIdSet(eligibleMovieIds);
  const seenKeys = new Set();
  const entries = [];

  for (const { movie, expectedRank } of candidates) {
    // Sequential on purpose: once the queue holds enough previews that
    // nothing later in the list can outrank, the remaining lookups are waste.
    // Because unplayed movies sort first, that is usually after `wanted` calls.
    if (entries.filter((entry) => entry.rank <= expectedRank).length >= wanted) break;

    const trailer = await fetchTrailer(movie);
    const key = trailer?.key ? String(trailer.key) : "";
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    entries.push({
      rank: getEntryRank({
        isDrawable: !drawable || drawable.has(String(movie.id)),
        isRepeat: recentKeys.has(key),
      }),
      movieId: movie.id,
      tmdbId: getPositiveTmdbId(movie.tmdb_id),
      title: movie.title || "",
      trailer,
    });
  }

  // Sort is stable, so each rank keeps the order it was looked up in.
  return entries
    .sort((first, second) => first.rank - second.rank)
    .slice(0, wanted)
    .map(({ movieId, tmdbId, title, trailer }) => ({ movieId, tmdbId, title, trailer }));
}

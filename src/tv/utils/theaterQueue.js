import { clampTheaterTrailerCount } from "../../utils/drawSettings";

const RECENT_TRAILER_STORAGE_KEY = "movie-bowl:tv:recent-trailers";

// Roughly two full movie nights of previews, so a trailer only comes back
// around once the bowl's usable trailer pool has had a chance to cycle.
const RECENT_TRAILER_LIMIT = 40;

// Detail lookups are sequential and stop as soon as the queue is full, so this
// only bounds the worst case where most candidates have no official trailer.
const LOOKUPS_PER_TRAILER = 3;

export function readRecentTrailerKeys() {
  try {
    const raw = window.localStorage.getItem(RECENT_TRAILER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function rememberTrailerKeys(keys) {
  const incoming = [...new Set((keys || []).filter(Boolean).map(String))];
  if (incoming.length === 0) return readRecentTrailerKeys();

  const retained = readRecentTrailerKeys().filter((key) => !incoming.includes(key));
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

export function selectTrailerCandidates(
  movies,
  { excludeMovieId, eligibleMovieIds = null, random } = {}
) {
  // Custom entries carry a negative synthetic tmdb_id and have no TMDB videos.
  const playable = (movies || []).filter(
    (movie) =>
      movie &&
      movie.id !== excludeMovieId &&
      Number.isInteger(Number(movie.tmdb_id)) &&
      Number(movie.tmdb_id) > 0
  );

  const drawable = toIdSet(eligibleMovieIds);
  if (!drawable) return shuffle(playable, random);

  // A preview only previews something if the title could still be drawn under
  // the settings the draw just ran with, so the resolved pool leads and the
  // rest of the bowl is only there to backfill.
  return [
    ...shuffle(playable.filter((movie) => drawable.has(String(movie.id))), random),
    ...shuffle(playable.filter((movie) => !drawable.has(String(movie.id))), random),
  ];
}

// Two preferences order the queue and they can disagree, so eligibility wins:
// a title the draw can no longer reach is not a preview of anything, while a
// repeat is only a small loss of novelty.
function getEntryRank({ isDrawable, isRepeat }) {
  return (isDrawable ? 0 : 2) + (isRepeat ? 1 : 0);
}

/**
 * Resolves up to `count` playable previews from the movies still in the bowl.
 * `eligibleMovieIds` is the pool the draw resolved for tonight's settings;
 * titles outside it, and trailers the device played recently, are only used to
 * backfill once the better candidates are exhausted.
 */
export async function buildTrailerQueue({
  movies,
  eligibleMovieIds = null,
  excludeMovieId,
  count,
  recentKeys = [],
  fetchTrailer,
  random,
}) {
  const wanted = clampTheaterTrailerCount(count);
  const candidates = selectTrailerCandidates(movies, {
    excludeMovieId,
    eligibleMovieIds,
    random,
  });
  if (candidates.length === 0 || typeof fetchTrailer !== "function") return [];

  const recent = new Set(recentKeys);
  const drawable = toIdSet(eligibleMovieIds);
  const lookupLimit = Math.min(candidates.length, wanted * LOOKUPS_PER_TRAILER);
  const seenKeys = new Set();
  const entries = [];
  let idealCount = 0;

  for (const movie of candidates.slice(0, lookupLimit)) {
    // Sequential on purpose: the loop stops as soon as the queue fills with
    // candidates nothing later in the list could outrank.
    if (idealCount >= wanted) break;

    const trailer = await fetchTrailer(movie);
    const key = trailer?.key ? String(trailer.key) : "";
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    const rank = getEntryRank({
      isDrawable: !drawable || drawable.has(String(movie.id)),
      isRepeat: recent.has(key),
    });
    if (rank === 0) idealCount += 1;
    entries.push({ rank, movieId: movie.id, title: movie.title || "", trailer });
  }

  // Sort is stable, so each rank keeps the shuffled order it arrived in.
  return entries
    .sort((first, second) => first.rank - second.rank)
    .slice(0, wanted)
    .map((entry) => ({ movieId: entry.movieId, title: entry.title, trailer: entry.trailer }));
}

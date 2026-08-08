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

export function selectTrailerCandidates(movies, { excludeMovieId, random } = {}) {
  // Custom entries carry a negative synthetic tmdb_id and have no TMDB videos.
  const eligible = (movies || []).filter(
    (movie) =>
      movie &&
      movie.id !== excludeMovieId &&
      Number.isInteger(Number(movie.tmdb_id)) &&
      Number(movie.tmdb_id) > 0
  );

  return shuffle(eligible, random);
}

/**
 * Resolves up to `count` playable previews from the movies still in the bowl.
 * Trailers the device played recently are only used to backfill once every
 * unseen candidate has been exhausted.
 */
export async function buildTrailerQueue({
  movies,
  excludeMovieId,
  count,
  recentKeys = [],
  fetchTrailer,
  random,
}) {
  const wanted = clampTheaterTrailerCount(count);
  const candidates = selectTrailerCandidates(movies, { excludeMovieId, random });
  if (candidates.length === 0 || typeof fetchTrailer !== "function") return [];

  const recent = new Set(recentKeys);
  const lookupLimit = Math.min(candidates.length, wanted * LOOKUPS_PER_TRAILER);
  const seenKeys = new Set();
  const fresh = [];
  const repeats = [];

  for (const movie of candidates.slice(0, lookupLimit)) {
    if (fresh.length >= wanted) break;

    // Sequential on purpose: the loop stops as soon as the queue fills.
    const trailer = await fetchTrailer(movie);
    const key = trailer?.key ? String(trailer.key) : "";
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    const entry = { movieId: movie.id, title: movie.title || "", trailer };
    if (recent.has(key)) {
      repeats.push(entry);
    } else {
      fresh.push(entry);
    }
  }

  return [...fresh, ...repeats].slice(0, wanted);
}

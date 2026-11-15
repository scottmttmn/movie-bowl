// A rating is two down, one down, one up or two up. Unrated is null, never a
// zero, so leaving a movie unrated can never read as a verdict.
export const RATING_VALUES = [-2, -1, 1, 2];

// Spoken names only: on screen the thumbs are the scale.
export const RATING_NAMES = {
  "-2": "Strong dislike",
  "-1": "Dislike",
  1: "Like",
  2: "Love",
};

export function isRating(value) {
  return RATING_VALUES.includes(value);
}

export function normalizeRating(value) {
  const number = Number(value);
  return value != null && isRating(number) ? number : null;
}

function hasTmdbId(entry) {
  return Number(entry?.tmdb_id) > 0;
}

/**
 * Indexes your ratings the way the database keys them: a TMDB movie by its id,
 * so every viewing of it shares one rating, and a custom title by the history
 * entry it was rated on.
 */
export function indexRatings(rows = []) {
  const byTmdbId = new Map();
  const byEntryId = new Map();

  (rows || []).forEach((row) => {
    const rating = normalizeRating(row?.rating);
    if (rating == null) return;
    if (Number(row?.tmdb_id) > 0) byTmdbId.set(Number(row.tmdb_id), rating);
    else if (row?.watch_event_id) byEntryId.set(row.watch_event_id, rating);
  });

  return { byTmdbId, byEntryId };
}

export function getEntryRating(index, entry) {
  if (!index || !entry) return null;
  if (hasTmdbId(entry)) return index.byTmdbId.get(Number(entry.tmdb_id)) ?? null;
  return index.byEntryId.get(entry.id) ?? null;
}

/**
 * What one rating is keyed on: every viewing of a TMDB movie shares a key, a
 * custom title has its entry's.
 */
export function ratingKeyFor(entry) {
  return hasTmdbId(entry) ? `tmdb:${Number(entry.tmdb_id)}` : `entry:${entry?.id}`;
}

/** Returns a new index with one entry's movie rated (or cleared, with null). */
export function withEntryRating(index, entry, rating) {
  const next = {
    byTmdbId: new Map(index?.byTmdbId || []),
    byEntryId: new Map(index?.byEntryId || []),
  };
  const [map, key] = hasTmdbId(entry)
    ? [next.byTmdbId, Number(entry.tmdb_id)]
    : [next.byEntryId, entry?.id];

  if (key == null) return next;
  if (rating == null) map.delete(key);
  else map.set(key, rating);
  return next;
}

/**
 * Groups a bowl's rating rows by draw: your own thumb, then everyone else who
 * has rated it. Someone else's `rating` is null until you rate that movie
 * yourself -- the database keeps it face down until then.
 */
export function groupBowlRatings(rows = []) {
  const byDraw = new Map();

  (rows || []).forEach((row) => {
    if (!row?.draw_event_id) return;
    const group = byDraw.get(row.draw_event_id) || { mine: null, others: [] };
    const rating = normalizeRating(row.rating);

    if (row.is_self) {
      group.mine = rating;
    } else {
      group.others.push({
        userId: row.user_id,
        name: row.display_name || null,
        rating,
      });
    }
    byDraw.set(row.draw_event_id, group);
  });

  byDraw.forEach((group) => {
    group.others.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  });

  return byDraw;
}

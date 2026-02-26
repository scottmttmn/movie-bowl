const VALID_RATINGS = ["G", "PG", "PG-13", "R", "NC-17"];

export function normalizeMpaaRating(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (VALID_RATINGS.includes(normalized)) return normalized;
  return null;
}

export function extractUsMovieRating(movieDetails) {
  const results = movieDetails?.release_dates?.results;
  if (!Array.isArray(results)) return null;

  const usEntry = results.find((entry) => String(entry?.iso_3166_1 || "").toUpperCase() === "US");
  if (!usEntry || !Array.isArray(usEntry.release_dates)) return null;

  for (const release of usEntry.release_dates) {
    const rating = normalizeMpaaRating(release?.certification);
    if (rating) return rating;
  }

  return null;
}

export const MPAA_RATING_OPTIONS = VALID_RATINGS;

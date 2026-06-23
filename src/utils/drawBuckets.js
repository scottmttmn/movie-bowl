function getEmailLocalPart(email) {
  const normalized = String(email || "").trim();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) return null;
  return normalized.slice(0, atIndex);
}

export function getContributorBucketKey(movie) {
  if (movie?.added_by) return `user:${movie.added_by}`;

  const fallbackName = String(movie?.added_by_name || "").trim();
  if (fallbackName) return `guest:${fallbackName.toLowerCase()}`;

  return "guest:Link Guest";
}

export function getContributorBucketLabel(movie) {
  const email = String(movie?.profiles?.email || "").trim();
  if (email) return email;

  if (movie?.added_by) return String(movie.added_by);

  const guestName = String(movie?.added_by_name || "").trim();
  return guestName || "Link Guest";
}

export function getMovieAttributionLabel(movie) {
  const guestName = String(movie?.added_by_name || "").trim();
  if (guestName) return guestName;

  return getEmailLocalPart(movie?.profiles?.email);
}

export function buildDrawOddsStats(movies = []) {
  const buckets = new Map();

  (movies || []).forEach((movie) => {
    if (!movie || movie.local_status === "syncing") return;
    const key = getContributorBucketKey(movie);
    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketKey: key,
        member: getContributorBucketLabel(movie),
        movieCount: 0,
        drawOdds: 0,
      });
    }
    buckets.get(key).movieCount += 1;
  });

  const stats = Array.from(buckets.values()).sort((a, b) => a.member.localeCompare(b.member));
  const bucketCount = stats.length;
  return stats.map((stat) => ({
    ...stat,
    drawOdds: bucketCount > 0 ? 1 / bucketCount : 0,
  }));
}

function getEmailLocalPart(email) {
  const normalized = String(email || "").trim();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) return null;
  return normalized.slice(0, atIndex);
}

const CONTRIBUTOR_ACCENTS = [
  { backgroundColor: "#3f0d28", borderColor: "#fb7185", avatarColor: "#e11d48" },
  { backgroundColor: "#12355b", borderColor: "#38bdf8", avatarColor: "#0284c7" },
  { backgroundColor: "#312e68", borderColor: "#a78bfa", avatarColor: "#7c3aed" },
  { backgroundColor: "#3f2a0a", borderColor: "#fbbf24", avatarColor: "#d97706" },
  { backgroundColor: "#103b32", borderColor: "#34d399", avatarColor: "#059669" },
  { backgroundColor: "#4a164f", borderColor: "#e879f9", avatarColor: "#c026d3" },
];

function getStableStringHash(value) {
  return Array.from(String(value || "")).reduce(
    (hash, character) => ((hash << 5) - hash + character.charCodeAt(0)) | 0,
    0
  );
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

export function getMovieAttributionAccent(movie) {
  const contributorName = String(movie?.added_by_name || "").trim();
  const contributorKey = contributorName
    ? `named:${contributorName.toLowerCase()}`
    : getContributorBucketKey(movie);
  return CONTRIBUTOR_ACCENTS[Math.abs(getStableStringHash(contributorKey)) % CONTRIBUTOR_ACCENTS.length];
}

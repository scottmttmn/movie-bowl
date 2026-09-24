import { getProfileDisplayName } from "./profileIdentity";

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

// A starter pack slip belongs to nobody: it is in every person's pile rather
// than a pile of its own (output/designs/starter-packs.md). It is recognized by
// its marker and never by name, so a link guest who types a pack's name is
// still a guest.
export function isStarterPackMovie(movie) {
  return Boolean(movie?.starter_pack);
}

// Null for a pack slip: it has no contributor to be bucketed under.
export function getContributorBucketKey(movie) {
  if (isStarterPackMovie(movie)) return null;
  if (movie?.added_by) return `user:${movie.added_by}`;

  const fallbackName = String(movie?.added_by_name || "").trim();
  if (fallbackName) return `guest:${fallbackName.toLowerCase()}`;

  return "guest:Link Guest";
}

export function getMovieAttributionLabel(movie) {
  const guestName = String(movie?.added_by_name || "").trim();
  if (guestName) return guestName;

  return movie?.added_by
    ? getProfileDisplayName(movie?.profiles, movie.added_by)
    : null;
}

// How a title's source is said wherever a person would be named. A pack pick
// has no person and no comment, so the pack's name stands where theirs would.
export function getMovieAttributionLine(movie) {
  const label = getMovieAttributionLabel(movie);
  if (!label) return null;
  return isStarterPackMovie(movie) ? `From the ${label} pack` : `Added by ${label}`;
}

export function getMovieAttributionAccent(movie) {
  const contributorName = String(movie?.added_by_name || "").trim();
  const contributorKey = contributorName
    ? `named:${contributorName.toLowerCase()}`
    : getContributorBucketKey(movie);
  return CONTRIBUTOR_ACCENTS[Math.abs(getStableStringHash(contributorKey)) % CONTRIBUTOR_ACCENTS.length];
}

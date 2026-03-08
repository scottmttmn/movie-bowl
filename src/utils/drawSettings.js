import { MPAA_RATING_OPTIONS } from "./movieRatings";

export const RUNTIME_FILTER_MIN_MINUTES = 0;
export const RUNTIME_FILTER_MAX_MINUTES = 500;

export const DRAW_GENRE_OPTIONS = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Music",
  "Mystery",
  "Romance",
  "Science Fiction",
  "TV Movie",
  "Thriller",
  "War",
  "Western",
];

export const DEFAULT_DRAW_SETTINGS = {
  prioritizeStreaming: false,
  useStreamingRank: true,
  enablePreferredRokuAppLaunch: false,
  enablePreferredWebLaunch: false,
  selectedRatings: MPAA_RATING_OPTIONS,
  includeUnknownRatings: true,
  selectedGenres: null,
  includeUnknownGenres: true,
  runtimeMinMinutes: RUNTIME_FILTER_MIN_MINUTES,
  runtimeMaxMinutes: RUNTIME_FILTER_MAX_MINUTES,
  includeUnknownRuntime: true,
};

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded >= 1 ? rounded : fallback;
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : fallback;
}

function normalizeSelectedRatings(value) {
  if (!Array.isArray(value)) return DEFAULT_DRAW_SETTINGS.selectedRatings;
  const normalized = value.filter((rating) => MPAA_RATING_OPTIONS.includes(rating));
  return [...new Set(normalized)];
}

function normalizeSelectedGenres(value) {
  if (value === null) return null;
  if (!Array.isArray(value)) return DEFAULT_DRAW_SETTINGS.selectedGenres;
  const normalized = value
    .map((genre) => String(genre || "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : [];
}

export function normalizeDefaultDrawSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const legacyPreferLongMovies = Boolean(source.preferLongMovies);
  const normalizedRuntimeMin = legacyPreferLongMovies
    ? normalizePositiveInteger(source.longMovieMinMinutes, 150)
    : normalizeNonNegativeInteger(source.runtimeMinMinutes, DEFAULT_DRAW_SETTINGS.runtimeMinMinutes);
  const normalizedRuntimeMax = legacyPreferLongMovies
    ? RUNTIME_FILTER_MAX_MINUTES
    : normalizeNonNegativeInteger(
        source.runtimeMaxMinutes ?? source.maxRuntimeMinutes,
        DEFAULT_DRAW_SETTINGS.runtimeMaxMinutes
      );
  const runtimeMinMinutes = Math.min(normalizedRuntimeMin, normalizedRuntimeMax);
  const runtimeMaxMinutes = Math.max(normalizedRuntimeMin, normalizedRuntimeMax);

  return {
    prioritizeStreaming: Boolean(source.prioritizeStreaming),
    useStreamingRank:
      source.useStreamingRank === undefined
        ? DEFAULT_DRAW_SETTINGS.useStreamingRank
        : Boolean(source.useStreamingRank),
    enablePreferredRokuAppLaunch:
      source.enablePreferredRokuAppLaunch === undefined
        ? DEFAULT_DRAW_SETTINGS.enablePreferredRokuAppLaunch
        : Boolean(source.enablePreferredRokuAppLaunch),
    enablePreferredWebLaunch:
      source.enablePreferredWebLaunch === undefined
        ? DEFAULT_DRAW_SETTINGS.enablePreferredWebLaunch
        : Boolean(source.enablePreferredWebLaunch),
    selectedRatings: normalizeSelectedRatings(source.selectedRatings),
    includeUnknownRatings:
      source.includeUnknownRatings === undefined
        ? DEFAULT_DRAW_SETTINGS.includeUnknownRatings
        : Boolean(source.includeUnknownRatings),
    selectedGenres: normalizeSelectedGenres(source.selectedGenres),
    includeUnknownGenres:
      source.includeUnknownGenres === undefined
        ? DEFAULT_DRAW_SETTINGS.includeUnknownGenres
        : Boolean(source.includeUnknownGenres),
    runtimeMinMinutes,
    runtimeMaxMinutes,
    includeUnknownRuntime:
      source.includeUnknownRuntime === undefined
        ? DEFAULT_DRAW_SETTINGS.includeUnknownRuntime
        : Boolean(source.includeUnknownRuntime),
  };
}

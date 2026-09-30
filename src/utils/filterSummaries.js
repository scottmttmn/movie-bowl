import { MPAA_RATING_OPTIONS } from "./movieRatings";
import { RUNTIME_FILTER_MAX_MINUTES, RUNTIME_FILTER_MIN_MINUTES } from "./drawSettings";

// What each filter row reads back, in the words someone would use out loud:
// "Any length", "Up to 2 hr", "PG-13, R". An untouched filter says "Any";
// only a narrowed one says what it narrowed to.

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function describeRatings(selected = MPAA_RATING_OPTIONS, includeUnknown = true) {
  const all = selected.length === MPAA_RATING_OPTIONS.length;
  if (all && includeUnknown) return "Any rating";
  if (selected.length === 0) return includeUnknown ? "Unrated only" : "None";
  const list = all ? "Rated only" : MPAA_RATING_OPTIONS.filter((rating) => selected.includes(rating)).join(", ");
  return includeUnknown && !all ? `${list} or unrated` : list;
}

export function describeGenres(selected, available = [], includeUnknown = true) {
  if (!Array.isArray(selected)) return includeUnknown ? "Any genre" : "Listed genres only";
  if (selected.length === 0) return includeUnknown ? "Uncategorized only" : "None";
  // In the sheet's own order where it knows the genres, so the summary does
  // not reshuffle as chips are tapped.
  const ordered = available.filter((genre) => selected.includes(genre));
  const names = ordered.length ? ordered : selected;
  const list = names.length <= 3 ? names.join(", ") : `${names.length} genres`;
  return includeUnknown ? `${list} or uncategorized` : list;
}

export function describeRuntime(min = RUNTIME_FILTER_MIN_MINUTES, max = RUNTIME_FILTER_MAX_MINUTES, includeUnknown = true) {
  const hasMin = min > RUNTIME_FILTER_MIN_MINUTES;
  const hasMax = max < RUNTIME_FILTER_MAX_MINUTES;
  if (!hasMin && !hasMax) return includeUnknown ? "Any length" : "Known lengths only";
  let range = `${formatMinutes(min)} to ${formatMinutes(max)}`;
  if (!hasMin) range = `Up to ${formatMinutes(max)}`;
  else if (!hasMax) range = `At least ${formatMinutes(min)}`;
  return includeUnknown ? `${range} or unknown` : range;
}

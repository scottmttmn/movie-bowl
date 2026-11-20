// A quick filter over lists the person already has on screen: their own
// slips, a bowl's watched movies, their Watch History. It only narrows what
// is loaded; it never searches TMDB (the add sheet does that).

// Shown only once a list is long enough that scrolling is the slower way.
export const LIST_SEARCH_THRESHOLD = 8;

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchesListQuery(movie, query) {
  const needle = fold(query);
  if (!needle) return true;
  return fold(movie?.title).includes(needle);
}

export function filterByListQuery(movies, query) {
  return fold(query) ? (movies || []).filter((movie) => matchesListQuery(movie, query)) : movies || [];
}

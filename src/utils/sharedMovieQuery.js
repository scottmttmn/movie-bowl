// Turns what Android's share sheet hands /quick-add into words worth searching.
// Apps share whatever they like: a browser sends the page title and its URL, a
// streaming app sends "Check out ... on ..." with a link. Only the obvious
// wrapping comes off here. Anything messier still reads as a description, and
// smart search is the better judge of that than a longer list of patterns.

const URL_PATTERN = /https?:\/\/\S+/gi;
const MAX_QUERY_LENGTH = 120;

// Trailing segments that name the site rather than the movie, as page titles
// put them: "Sinners (2025) - IMDb", "Sinners | Rotten Tomatoes".
const SITE_SEGMENT = /^(imdb|letterboxd|rotten tomatoes|wikipedia|youtube|netflix|justwatch|metacritic|the movie database.*|tmdb|apple tv\+?|prime video|max|hulu|disney\+|google play|fandango)$/i;
const TRAILER_SEGMENT = /\b(official )?(trailer|teaser)\b/i;
const TRAILING_SEGMENT = /\s+[-|–—•·]\s+((?:(?!\s[-|–—•·]\s).)+?)\s*$/;

function stripSegments(text) {
  let rest = text;
  for (let match = rest.match(TRAILING_SEGMENT); match; match = rest.match(TRAILING_SEGMENT)) {
    if (!SITE_SEGMENT.test(match[1]) && !TRAILER_SEGMENT.test(match[1])) break;
    rest = rest.slice(0, match.index);
  }
  return rest;
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  // Page titles can carry invisible direction marks (Letterboxd leads with one).
  let text = value.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "").replace(URL_PATTERN, " ").replace(/\s+/g, " ").trim();
  if (!text || SITE_SEGMENT.test(text)) return "";
  text = stripSegments(text)
    // Letterboxd: "Sinners (2025) directed by Ryan Coogler"
    .replace(/\s+directed by\s.*$/i, "")
    .replace(/^(check out|watch|i'm watching|i am watching)\s+/i, "")
    .replace(/\s+on\s+(netflix|prime video|apple tv\+?|max|hulu|disney\+|youtube)[!.]*$/i, "")
    // A year or "(2025 film)" in brackets narrows nothing a title search uses.
    .replace(/\s*\((?:\d{4})(?:\s+film)?\)/gi, "")
    .replace(/^["“'‘]+|["”'’.!]+$/g, "")
    .trim();
  return text;
}

// A bare link still names the movie in its path on most film sites:
// letterboxd.com/film/sinners-2025/, rottentomatoes.com/m/sinners_2025.
function queryFromUrl(value) {
  const match = typeof value === "string" ? value.match(URL_PATTERN) : null;
  if (!match) return "";
  let url;
  try {
    url = new URL(match[0]);
  } catch {
    return "";
  }
  const slug = url.pathname.split("/").filter(Boolean).at(-1) || "";
  // IMDb's tt ids and other opaque ids carry no words to search.
  if (!slug || /^tt\d+$/i.test(slug) || /^\d+$/.test(slug)) return "";
  let decoded;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    decoded = slug;
  }
  const words = decoded
    .replace(/\.[a-z]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\(?\b\d{4}(\s+film)?\)?$/i, "")
    .replace(/^\d+\s+/, "")
    .trim();
  return /[a-z]/i.test(words) ? words : "";
}

export function getSharedMovieQuery({ title = "", text = "", url = "", q = "" } = {}) {
  const query = cleanText(q) || cleanText(title) || cleanText(text)
    || queryFromUrl(url) || queryFromUrl(text) || queryFromUrl(title);
  return query.slice(0, MAX_QUERY_LENGTH).trim();
}

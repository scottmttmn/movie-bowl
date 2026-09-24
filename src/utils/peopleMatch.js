// When a search query is plainly a person's name, search offers that person
// above the movies (output/designs/search-revamp.md, "The People row"). The
// rule is what keeps ordinary title searches looking exactly as they did, so it
// errs toward showing no one: a title that happens to be a name should not
// grow a row of strangers above it.

export const PEOPLE_MIN_QUERY_LENGTH = 3;
export const PEOPLE_MAX_RESULTS = 3;
// TMDB person popularity runs from well under 1 for a one-credit name to the
// tens for a household name. This is a starting value, to be tuned against real
// queries rather than trusted.
export const PEOPLE_POPULARITY_FLOOR = 1.5;

// Letters and digits in any script: an ASCII-only class would erase a name
// written in Chinese or Cyrillic entirely, so it could never match itself.
export function nameWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Every word typed must start a word of the name, so "tom han" and "hanks"
// find Tom Hanks and "anks" finds no one. A title can still start a name --
// "big" starts "Bigg" -- which is what the popularity floor is for.
export function queryMatchesName(query, name) {
  const queryWords = nameWords(query);
  const targetWords = nameWords(name);
  if (queryWords.length === 0 || targetWords.length === 0) return false;
  return queryWords.every((queryWord) => targetWords.some((targetWord) => targetWord.startsWith(queryWord)));
}

export function selectStrongPeopleMatches(query, people, {
  minQueryLength = PEOPLE_MIN_QUERY_LENGTH,
  popularityFloor = PEOPLE_POPULARITY_FLOOR,
  maxResults = PEOPLE_MAX_RESULTS,
} = {}) {
  if (String(query || "").trim().length < minQueryLength) return [];
  return (Array.isArray(people) ? people : [])
    .filter((person) => person && person.adult !== true)
    .filter((person) => (Number(person.popularity) || 0) >= popularityFloor)
    .filter((person) => queryMatchesName(query, person.name))
    .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
    .slice(0, maxResults);
}

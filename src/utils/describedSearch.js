import { nameWords, queryMatchesName } from "./peopleMatch.js";

// Whether a search could be a description rather than a title. Never when
// title search found a movie whose title the words spell: that was what was
// meant. Only a query of several words reads as one -- and a long real title
// still matches itself, so length alone never sends it. The caller also
// checks that people search found no one, after this, so a title search
// never waits on the people lookup.
export const DESCRIBE_MIN_WORDS = 3;

export function shouldDescribe(query, titleResults = []) {
  if (nameWords(query).length < DESCRIBE_MIN_WORDS) return false;
  return !(titleResults || []).some((movie) =>
    queryMatchesName(query, movie?.title) || queryMatchesName(query, movie?.original_title)
  );
}

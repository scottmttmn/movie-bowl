// A search that finds nothing is usually a misspelling, and TMDB's search has
// no tolerance for one: "martin scorcese" finds no one. Most slips in a name
// or title come after its first few letters, so the last word is trimmed back
// until something matches -- "martin scor" finds Martin Scorsese. A typo in an
// earlier word, or in the first letters of the last one, is not found.

export const SUGGESTION_MIN_WORD_LENGTH = 3;

/**
 * Finds the longest trim of the query's last word that still matches.
 * `hasMatches(candidate)` resolves true when a candidate finds something real;
 * it is injected so the search itself stays testable. Matches only ever get
 * rarer as the word gets longer, so this bisects rather than trying every
 * length: at most three probes for a word of ten letters.
 *
 * Resolves the suggested query, or null when no trim of the last word matches.
 */
export async function suggestTrimmedQuery(query, hasMatches, {
  minWordLength = SUGGESTION_MIN_WORD_LENGTH,
} = {}) {
  const words = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const lastWord = words[words.length - 1];
  const head = words.slice(0, -1).join(" ");
  const withLastWord = (length) => [head, lastWord.slice(0, length)].filter(Boolean).join(" ");

  let shortest = minWordLength;
  let longest = lastWord.length - 1;
  let best = null;
  while (shortest <= longest) {
    const length = Math.ceil((shortest + longest) / 2);
    if (await hasMatches(withLastWord(length))) {
      best = length;
      shortest = length + 1;
    } else {
      longest = length - 1;
    }
  }
  return best === null ? null : withLastWord(best);
}

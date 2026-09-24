import { nameWords } from "./peopleMatch.js";

// A search that finds nothing is usually a misspelling, and TMDB's search has
// no tolerance for one: "scorcese" finds no one. Most slips come after a
// word's first few letters, so the last word is trimmed back to find what it
// was meant to be -- but the longest trim that finds anything is not the
// answer: "scorc" finds Scorched before "scor" finds Scorsese. So every trim is
// asked at once, and the suggestion is the whole word they turn up that is
// closest to what was typed. A typo in an earlier word, or in the first
// letters of the last one ("scrosese"), is not found.

export const SUGGESTION_MIN_WORD_LENGTH = 3;
// Each probe costs a movie and a person search, all in parallel, and only for
// searches that found nothing.
export const SUGGESTION_MAX_PROBES = 5;

// Optimal string alignment distance: edits, with a swapped pair counting once.
export function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// One slip in a short word, two in a longer one. Beyond that the nearest word
// is a different word, and no suggestion beats a wrong one.
function allowedDistance(word) {
  return word.length <= 5 ? 1 : 2;
}

/**
 * `probe(candidate)` resolves the titles and names a candidate query finds,
 * as `{ text, popularity }`, already limited to ones the candidate's words
 * start. It is injected so the choice stays testable.
 *
 * Resolves the query with its last word replaced by the closest word found,
 * or null when nothing close enough turns up.
 */
export async function suggestCorrection(query, probe, {
  minWordLength = SUGGESTION_MIN_WORD_LENGTH,
  maxProbes = SUGGESTION_MAX_PROBES,
} = {}) {
  const typedWords = String(query || "").trim().split(/\s+/).filter(Boolean);
  if (typedWords.length === 0) return null;
  // Only the last run of letters is corrected. Anything before it in the same
  // token -- the "o'" of "o'conner", the "wall-" of "wall-ea" -- stays as
  // typed, so the probes still spell it and the suggestion keeps it.
  const lastToken = typedWords[typedWords.length - 1].replace(/[^\p{L}\p{N}\p{M}]+$/u, "");
  const split = lastToken.match(/^(.*[^\p{L}\p{N}\p{M}])?([\p{L}\p{N}\p{M}]+)$/u);
  if (!split) return null;
  const tokenHead = split[1] || "";
  const typed = nameWords(split[2]).join("");
  const head = typedWords.slice(0, -1).join(" ");
  const withLastWord = (word) => [head, `${tokenHead}${word}`].filter(Boolean).join(" ");

  const lengths = [];
  for (let length = typed.length - 1; length >= minWordLength && lengths.length < maxProbes; length -= 1) {
    lengths.push(length);
  }
  if (lengths.length === 0) return null;

  const answers = await Promise.all(lengths.map((length) => probe(withLastWord(typed.slice(0, length)))));

  let best = null;
  answers.forEach((matches, index) => {
    const prefix = typed.slice(0, lengths[index]);
    for (const { text, popularity } of matches || []) {
      for (const word of nameWords(text)) {
        if (!word.startsWith(prefix) || word === typed) continue;
        const distance = editDistance(typed, word);
        if (distance > allowedDistance(typed)) continue;
        const score = Number(popularity) || 0;
        if (!best || distance < best.distance || (distance === best.distance && score > best.popularity)) {
          best = { word, distance, popularity: score };
        }
      }
    }
  });
  return best ? withLastWord(best.word) : null;
}

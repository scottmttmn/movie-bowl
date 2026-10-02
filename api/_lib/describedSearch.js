import { tmdbFetch } from "./tmdb.js";
import { nameWords, queryMatchesName } from "../../src/utils/peopleMatch.js";

// Search by description ("space movie where Matt Damon is stranded"). A small
// language model reads the description into TMDB's own terms -- people,
// genres, keywords, years, language -- and TMDB's discover endpoint finds the
// movies. A quote or a famous scene has no such terms, so the model may also
// name the titles it recognizes; each is shown only once TMDB finds a movie
// by that exact title, so every result is still a real one. See
// output/designs/described-search.md.

// TMDB's movie genres. Fixed for years, and the model is told to pick from
// exactly these names, so a genre it invents simply does not match.
export const TMDB_MOVIE_GENRES = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749,
  "Science Fiction": 878, Thriller: 53, War: 10752, Western: 37,
};

const MAX_PEOPLE = 2;
const MAX_GENRES = 2;
const MAX_KEYWORDS = 2;
const MAX_TITLES = 3;
const MODEL_TIMEOUT_MS = 5000;

const SYSTEM_PROMPT = `You turn a search for a movie, an actor or a director -- often a description, a quote or a misspelled name -- into search terms for The Movie Database.
Reply with JSON only, shaped exactly like:
{"titles":[],"people":[],"genres":[],"keywords":[],"yearFrom":null,"yearTo":null,"language":null}
- titles: up to three movies you are confident the search points to (a quote, a scene, a plot), each as {"title":"...","year":1979}.
- people: actors or directors the search names, misspells or describes ("the guy who played Gandalf" is Ian McKellen), as full names spelled correctly.
- genres: only from this list: ${Object.keys(TMDB_MOVIE_GENRES).join(", ")}.
- keywords: at most two short plot words or themes (e.g. "heist", "time travel"), never a genre or a name.
- yearFrom/yearTo: release years if the search gives an era ("90s" is 1990 to 1999), else null.
- language: the two-letter ISO 639-1 code of the movie's language if the search gives one ("Korean thriller" is "ko"), else null.
Leave a list empty rather than guess.`;

// Each provider speaks OpenAI's chat completions format. They are tried in
// order, and one that is unconfigured, slow, over its free limit or down is
// skipped -- the caller only learns that none answered.
export function getModelProviders(env = process.env) {
  const providers = [];
  if (env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: env.GROQ_API_KEY,
      model: env.GROQ_MODEL || "openai/gpt-oss-20b",
      jsonMode: true,
      // A reasoning model: low effort keeps it at search speed, and its
      // reasoning stays out of the reply rather than spending the answer's
      // token budget.
      extra: { reasoning_effort: "low", include_reasoning: false },
    });
  }
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) {
    providers.push({
      name: "cloudflare",
      url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/chat/completions`,
      key: env.CLOUDFLARE_AI_TOKEN,
      // The same open model as Groq's, so one prompt serves both. Cloudflare
      // retired Llama 3.1 8B on May 30, 2026 and answers 410 for it: a
      // retired model here reads as "resting", so check its deprecation list
      // before choosing another.
      model: env.CLOUDFLARE_AI_MODEL || "@cf/openai/gpt-oss-20b",
      jsonMode: false,
      extra: { reasoning_effort: "low" },
    });
  }
  return providers;
}

// The first {...} in a reply: a model without a JSON mode sometimes wraps its
// answer in a sentence or a code fence.
export function parseModelJson(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function cleanList(value, max) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && item.length <= 60 && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()))
    .slice(0, max);
}

function cleanYear(value) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1890 && year <= 2100 ? year : null;
}

function cleanTitles(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const titles = [];
  for (const item of value) {
    const title = String((typeof item === "string" ? item : item?.title) || "").trim();
    const key = title.toLowerCase();
    if (!title || title.length > 100 || seen.has(key)) continue;
    seen.add(key);
    titles.push({ title, year: cleanYear(item?.year) });
    if (titles.length === MAX_TITLES) break;
  }
  return titles;
}

function cleanLanguage(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

// Whatever the model said, only these shapes leave here.
export function normalizeInterpretation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const genreNames = Object.keys(TMDB_MOVIE_GENRES);
  const genres = cleanList(raw.genres, MAX_GENRES * 2)
    .map((genre) => genreNames.find((name) => name.toLowerCase() === genre.toLowerCase()))
    .filter(Boolean)
    .slice(0, MAX_GENRES);
  let yearFrom = cleanYear(raw.yearFrom);
  let yearTo = cleanYear(raw.yearTo);
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  return {
    titles: cleanTitles(raw.titles),
    people: cleanList(raw.people, MAX_PEOPLE),
    genres,
    keywords: cleanList(raw.keywords, MAX_KEYWORDS),
    yearFrom,
    yearTo,
    language: cleanLanguage(raw.language),
  };
}

export async function interpretDescription(query, { providers = getModelProviders(), fetchImpl = fetch } = {}) {
  for (const provider of providers) {
    try {
      const response = await fetchImpl(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0,
          max_tokens: 800,
          ...(provider.jsonMode ? { response_format: { type: "json_object" } } : {}),
          ...provider.extra,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: query },
          ],
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      if (!response.ok) {
        // The body says why (a retired model, a token without permission),
        // which the status alone did not.
        const detail = await response.text().catch(() => "");
        console.warn(`[api/tmdb/search] ${provider.name} answered ${response.status}`, detail.slice(0, 300));
        continue;
      }
      const body = await response.json().catch(() => null);
      const interpretation = normalizeInterpretation(parseModelJson(body?.choices?.[0]?.message?.content));
      if (interpretation) return interpretation;
      console.warn(`[api/tmdb/search] ${provider.name} returned no usable terms`);
    } catch (error) {
      console.warn(`[api/tmdb/search] ${provider.name} failed`, error?.name || error);
    }
  }
  return null;
}

function decadeLabel(from, to) {
  if (from && to && from % 10 === 0 && to === from + 9) return `${from}s`;
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `${from} on`;
  return `Before ${to + 1}`;
}

function languageLabel(code) {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    if (name && name.toLowerCase() !== code) return name;
  } catch {
    // An unknown code still filters; it just reads as itself.
  }
  return code.toUpperCase();
}

// The model's titles, kept only where TMDB has a movie by that title --
// the same letters and digits, so "Alien" never stands in for "Aliens" but
// "Chung-King Express", even with a typographic hyphen, is "Chungking
// Express". The model's year only chooses between remakes: it misremembers
// years (My Dinner with Andre is 1981, not the 1978 it gave), so a title
// TMDB has is never dropped for one. Anything TMDB lacks was a guess, and is
// dropped rather than shown.
const titleKey = (value) => nameWords(value).join("");

// TMDB's search splits on a hyphen the way the title is not always written,
// so a miss is retried with the hyphens closed up and then opened out.
function titleQueries(title) {
  const plain = title.replace(/\p{Pd}/gu, "-");
  return [...new Set([plain, plain.replace(/-/g, ""), plain.replace(/-/g, " ")])];
}

function yearDistance(movie, year) {
  const released = Number(String(movie?.release_date || "").slice(0, 4));
  return year && released ? Math.abs(released - year) : 0;
}

async function findTitle({ title, year }, fetchTmdb) {
  for (const query of titleQueries(title)) {
    // A lookup that fails loses only its own title, not the search.
    const data = await fetchTmdb(`/search/movie?query=${encodeURIComponent(query)}&page=1&language=en-US&include_adult=false`).catch(() => null);
    const match = (data?.results || [])
      .filter((movie) => movie?.adult !== true)
      .filter((movie) => [movie?.title, movie?.original_title].some((name) => titleKey(name) === titleKey(title)))
      .sort((a, b) => yearDistance(a, year) - yearDistance(b, year)
        || (Number(b.popularity) || 0) - (Number(a.popularity) || 0))[0];
    if (match) return match;
  }
  return null;
}

export async function verifyTitles(titles = [], fetchTmdb = tmdbFetch) {
  const found = await Promise.all(titles.map((title) => findTitle(title, fetchTmdb)));
  const seen = new Set();
  return found.filter((movie) => movie && !seen.has(movie.id) && seen.add(movie.id));
}

// Names into TMDB ids. A person must be someone the name actually names, and a
// keyword TMDB does not know is dropped rather than shown as a term that did
// nothing.
export async function resolveTerms(interpretation, fetchTmdb = tmdbFetch) {
  const people = await Promise.all(interpretation.people.map(async (name) => {
    const data = await fetchTmdb(`/search/person?query=${encodeURIComponent(name)}&page=1&language=en-US&include_adult=false`);
    const person = (data?.results || [])
      .filter((candidate) => candidate?.adult !== true && queryMatchesName(name, candidate?.name))
      .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))[0];
    return person ? { kind: "person", id: Number(person.id), label: person.name } : null;
  }));
  const keywords = await Promise.all(interpretation.keywords.map(async (word) => {
    const data = await fetchTmdb(`/search/keyword?query=${encodeURIComponent(word)}&page=1`);
    const keyword = (data?.results || []).find((candidate) => String(candidate?.name || "").toLowerCase() === word.toLowerCase())
      || (data?.results || [])[0];
    return keyword ? { kind: "keyword", id: Number(keyword.id), label: keyword.name } : null;
  }));
  const terms = [
    ...people.filter(Boolean),
    ...interpretation.genres.map((label) => ({ kind: "genre", id: TMDB_MOVIE_GENRES[label], label })),
    ...keywords.filter(Boolean),
  ];
  if (interpretation.language) {
    terms.push({ kind: "language", code: interpretation.language, label: languageLabel(interpretation.language) });
  }
  if (interpretation.yearFrom || interpretation.yearTo) {
    terms.push({
      kind: "years",
      from: interpretation.yearFrom,
      to: interpretation.yearTo,
      label: decadeLabel(interpretation.yearFrom, interpretation.yearTo),
    });
  }
  return terms;
}

// Terms back from the client after someone removes one. Ids only, so a
// forged request can at most search TMDB.
export function parseTermsParam(value) {
  let parsed;
  try {
    parsed = JSON.parse(String(value || ""));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > 8) return null;
  const terms = [];
  for (const term of parsed) {
    const kind = term?.kind;
    if (kind === "years") {
      const from = cleanYear(term.from);
      const to = cleanYear(term.to);
      if (!from && !to) return null;
      terms.push({ kind, from, to, label: decadeLabel(from, to) });
    } else if (kind === "language") {
      const code = cleanLanguage(term.code);
      if (!code) return null;
      terms.push({ kind, code, label: languageLabel(code) });
    } else if (["person", "genre", "keyword"].includes(kind)) {
      const id = Number(term.id);
      if (!Number.isInteger(id) || id <= 0) return null;
      terms.push({ kind, id, label: String(term.label || "").slice(0, 80) });
    } else {
      return null;
    }
  }
  return terms;
}

// TMDB files Cantonese films (Chungking Express) under its own "cn" code,
// beside Mandarin's "zh", and a model asked for Chinese names only "zh".
const LANGUAGE_VARIANTS = { zh: ["zh", "cn"] };

function discoverPath(terms, language) {
  const ids = (kind) => terms.filter((term) => term.kind === kind).map((term) => term.id);
  const params = new URLSearchParams({
    language: "en-US",
    region: "US",
    include_adult: "false",
    sort_by: "popularity.desc",
    "vote_count.gte": "20",
    page: "1",
  });
  // Everyone named, every genre; but any keyword, because a model's keyword
  // is a guess at how TMDB tagged the plot.
  if (ids("person").length) params.set("with_people", ids("person").join(","));
  if (ids("genre").length) params.set("with_genres", ids("genre").join(","));
  if (ids("keyword").length) params.set("with_keywords", ids("keyword").join("|"));
  const years = terms.find((term) => term.kind === "years");
  if (years?.from) params.set("primary_release_date.gte", `${years.from}-01-01`);
  if (years?.to) params.set("primary_release_date.lte", `${years.to}-12-31`);
  if (language) params.set("with_original_language", language);
  return `/discover/movie?${params}`;
}

export async function discoverMovies(terms, fetchTmdb = tmdbFetch) {
  const code = terms.find((term) => term.kind === "language")?.code;
  const languages = code ? LANGUAGE_VARIANTS[code] || [code] : [null];
  const pages = await Promise.all(languages.map((language) => fetchTmdb(discoverPath(terms, language))));
  const seen = new Set();
  return pages
    .flatMap((data) => data?.results || [])
    .filter((movie) => movie?.adult !== true && !seen.has(movie.id) && seen.add(movie.id))
    .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
    .slice(0, 20);
}

// A description rarely matches TMDB's tags exactly, so when every term
// together finds nothing, the guessiest terms go first: keywords, then
// genres. The terms returned are the ones the results actually used, so the
// chips never claim a filter that was dropped.
export async function discoverWithFallback(terms, fetchTmdb = tmdbFetch) {
  const attempts = [
    terms,
    terms.filter((term) => term.kind !== "keyword"),
    terms.filter((term) => term.kind !== "keyword" && term.kind !== "genre"),
  ];
  let previous = null;
  for (const attempt of attempts) {
    if (attempt.length === 0 || attempt.length === previous) continue;
    previous = attempt.length;
    const results = await discoverMovies(attempt, fetchTmdb);
    if (results.length > 0) return { terms: attempt, results };
  }
  return { terms: [], results: [] };
}

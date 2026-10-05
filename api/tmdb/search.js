import { tmdbFetch } from "../_lib/tmdb.js";
import { normalizePersonMovieCredits } from "../_lib/personCredits.js";
import { queryMatchesName, selectStrongPeopleMatches } from "../../src/utils/peopleMatch.js";
import { suggestCorrection } from "../../src/utils/searchSuggestion.js";
import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import { findPersonMoviesOnServices, parseServices } from "../_lib/personOnServices.js";
import { discoverWithFallback, interpretDescription, resolveTerms, verifyTitles } from "../_lib/describedSearch.js";

const MAX_QUERY_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 200;

// People are navigation, never slips: a person is returned with what
// identifies them, and their movies arrive as ordinary movie rows.
function toPerson(person) {
  const knownFor = (person?.known_for || [])
    .filter((credit) => credit?.media_type === "movie" && credit?.adult !== true)
    .map((credit) => credit.title || credit.original_title)
    .filter(Boolean)
    .slice(0, 3);
  return {
    id: Number(person.id),
    name: person.name,
    profilePath: person.profile_path || null,
    knownForDepartment: person.known_for_department || null,
    knownFor,
  };
}

async function searchPeople(query, res) {
  const data = await tmdbFetch(
    `/search/person?query=${encodeURIComponent(query)}&page=1&language=en-US&include_adult=false`
  );
  const people = selectStrongPeopleMatches(query, data?.results || []);
  res.status(200).json({ people: people.map(toPerson) });
}

async function getPersonMovies(personId, res) {
  const credits = await tmdbFetch(`/person/${personId}/movie_credits?language=en-US`);
  res.status(200).json({ personId, ...normalizePersonMovieCredits(credits) });
}

// What a trimmed query finds, limited to titles and strong person matches its
// words start: anything else TMDB returns for a fragment would offer words
// nobody was spelling.
async function probeCandidate(candidate) {
  const encoded = encodeURIComponent(candidate);
  const [movies, people] = await Promise.all([
    tmdbFetch(`/search/movie?query=${encoded}&page=1&language=en-US&region=US&include_adult=false`),
    tmdbFetch(`/search/person?query=${encoded}&page=1&language=en-US&include_adult=false`),
  ]);
  const titles = (movies?.results || [])
    .filter((movie) => movie?.adult !== true)
    .map((movie) => ({ text: movie?.title || movie?.original_title || "", popularity: movie?.popularity }))
    .filter((match) => queryMatchesName(candidate, match.text));
  const names = selectStrongPeopleMatches(candidate, people?.results || [])
    .map((person) => ({ text: person.name, popularity: person.popularity }));
  return [...titles, ...names];
}

// Described search spends a free model quota, so it is for signed-in people
// only; a public add link simply never offers it.
async function isSignedIn(req) {
  const token = String(req.headers?.authorization || "").match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return false;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  return !error && Boolean(data?.user);
}

// "unavailable" means no model answered -- unconfigured, over its free
// limit, or down -- and the client says so. "empty" means it answered and
// nothing came of it, which is just a search that found nothing.
async function describe(query, res) {
  const interpretation = await interpretDescription(query);
  if (!interpretation) {
    res.status(200).json({ status: "unavailable" });
    return;
  }
  // What the model read, without the words it read it from: the one way to
  // tell a description it did not recognize from a title TMDB did not match.
  console.info("[api/tmdb/search] described as", JSON.stringify(interpretation));
  const [picks, { results }] = await Promise.all([
    verifyTitles(interpretation.titles),
    resolveTerms(interpretation).then((resolved) => discoverWithFallback(resolved)),
  ]);
  // The titles the model recognized lead; the terms' own results follow
  // without repeating them.
  const pickIds = new Set(picks.map((movie) => movie.id));
  const rest = results.filter((movie) => !pickIds.has(movie.id));
  res.status(200).json(picks.length || rest.length ? { status: "ok", picks, results: rest } : { status: "empty" });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // One route, six actions, because the deployment is at Vercel Hobby's
  // 12-function limit. A missing type is today's title search.
  const type = String(req.query?.type || "movie");
  if (!["movie", "person", "person-movies", "person-on-services", "suggest", "describe"].includes(type)) {
    res.status(400).json({ error: "Invalid query parameter: type" });
    return;
  }

  if (type === "describe") {
    try {
      if (!(await isSignedIn(req))) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const description = String(req.query?.query || "").trim();
      if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
        res.status(400).json({ error: "Invalid query parameter: query" });
        return;
      }
      await describe(description, res);
    } catch (error) {
      console.error(`[api/tmdb/search] Failed to ${type}`, error);
      res.status(502).json({ error: "Failed to search by description" });
    }
    return;
  }

  if (type === "person-movies") {
    const personId = Number(req.query?.personId);
    if (!Number.isInteger(personId) || personId <= 0) {
      res.status(400).json({ error: "Invalid query parameter: personId" });
      return;
    }
    try {
      await getPersonMovies(personId, res);
    } catch (error) {
      const status = error?.statusCode === 404 ? 404 : 502;
      if (status === 502) console.error("[api/tmdb/search] Failed to fetch person credits", error);
      res.status(status).json({ error: status === 404 ? "Person not found" : "Failed to fetch TMDB credits" });
    }
    return;
  }

  if (type === "person-on-services") {
    const personId = Number(req.query?.personId);
    if (!Number.isInteger(personId) || personId <= 0) {
      res.status(400).json({ error: "Invalid query parameter: personId" });
      return;
    }
    const services = parseServices(req.query?.services);
    if (services.length === 0) {
      res.status(400).json({ error: "Invalid query parameter: services" });
      return;
    }
    try {
      res.status(200).json({ personId, movieIds: await findPersonMoviesOnServices(personId, services) });
    } catch (error) {
      console.error("[api/tmdb/search] Failed to find a person's movies on services", error);
      res.status(502).json({ error: "Failed to check streaming services" });
    }
    return;
  }

  const query = String(req.query?.query || "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing query parameter: query" });
    return;
  }
  if (type === "suggest") {
    // Only asked after a search found nothing, and never for a long query:
    // that is someone writing a custom slip, not misspelling a title.
    if (query.length > MAX_QUERY_LENGTH) {
      res.status(200).json({ query: null });
      return;
    }
    try {
      res.status(200).json({ query: await suggestCorrection(query, probeCandidate) });
    } catch (error) {
      console.error("[api/tmdb/search] Failed to suggest a query", error);
      res.status(502).json({ error: "Failed to suggest a search" });
    }
    return;
  }
  if (type === "person") {
    // No one's name is this long; a long query is someone typing a custom
    // slip, and it simply has no people rather than being refused.
    if (query.length > MAX_QUERY_LENGTH) {
      res.status(200).json({ people: [] });
      return;
    }
    try {
      await searchPeople(query, res);
    } catch (error) {
      console.error("[api/tmdb/search] Failed to search people", error);
      res.status(502).json({ error: "Failed to fetch TMDB people" });
    }
    return;
  }

  const page = req.query?.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    res.status(400).json({ error: "Invalid query parameter: page" });
    return;
  }

  try {
    const data = await tmdbFetch(
      `/search/movie?query=${encodeURIComponent(query)}&page=${page}&language=en-US&region=US&include_adult=false`
    );
    const results = (data?.results || []).filter((movie) => movie?.adult !== true);
    res.status(200).json({
      page: Number(data?.page) || page,
      totalPages: Math.min(Number(data?.total_pages) || 0, 500),
      totalResults: Number(data?.total_results) || 0,
      results,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || "Failed to fetch TMDB search results" });
  }
}

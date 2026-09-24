import { selectBestTrailer } from "../utils/selectTrailer";
import { getMovieReleaseStatus } from "../utils/movieReleaseStatus";
import { OFFLINE_MESSAGE, isOfflineError } from "../utils/networkErrors";

const MOVIE_DETAILS_CACHE_TTL_MS = 10 * 60 * 1000;
const movieDetailsCache = new Map();
const movieDetailsInflight = new Map();
let movieDetailsGeneration = 0;

export function clearTmdbMovieDetailsCache() {
  movieDetailsGeneration += 1;
  movieDetailsCache.clear();
  movieDetailsInflight.clear();
}

async function apiGet(url, { signal } = {}) {
  let response;
  try {
    response = signal ? await fetch(url, { signal }) : await fetch(url);
  } catch (error) {
    // Re-throw with copy callers can show verbatim. Without this the caller
    // only sees a bare TypeError and blames the movie service.
    if (isOfflineError(error)) {
      const offlineError = new Error(OFFLINE_MESSAGE);
      offlineError.name = "OfflineError";
      offlineError.cause = error;
      throw offlineError;
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`);
  }

  return data;
}

async function apiPost(url, body, accessToken) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch (error) {
    if (isOfflineError(error)) {
      const offlineError = new Error(OFFLINE_MESSAGE);
      offlineError.name = "OfflineError";
      offlineError.cause = error;
      throw offlineError;
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with ${response.status}`);
  }
  return data;
}

export async function searchTmdbMovies(query, { page = 1 } = {}) {
  const q = String(query || "").trim();
  const normalizedPage = Number(page);
  if (!q) return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  if (!Number.isInteger(normalizedPage) || normalizedPage < 1 || normalizedPage > 500) {
    throw new Error("Invalid search page");
  }
  return apiGet(
    `/api/tmdb/search?query=${encodeURIComponent(q)}&page=${normalizedPage}`
  );
}

// People search runs beside title search and must never hold it up, so it has
// a short budget of its own; a people lookup that is slow simply finds no one.
export const PEOPLE_SEARCH_TIMEOUT_MS = 2500;

export async function searchTmdbPeople(query, { signal, timeoutMs = PEOPLE_SEARCH_TIMEOUT_MS } = {}) {
  const q = String(query || "").trim();
  if (!q) return { people: [] };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const data = await apiGet(
      `/api/tmdb/search?type=person&query=${encodeURIComponent(q)}`,
      { signal: controller.signal }
    );
    return { people: Array.isArray(data?.people) ? data.people : [] };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
  }
}

// Asked only after a search found no titles and no one. A suggestion is a
// nicety, so any failure is simply no suggestion.
export async function suggestTmdbQuery(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  try {
    const data = await apiGet(`/api/tmdb/search?type=suggest&query=${encodeURIComponent(q)}`);
    return typeof data?.query === "string" && data.query.trim() ? data.query.trim() : null;
  } catch {
    return null;
  }
}

const PERSON_MOVIES_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSON_MOVIES_CACHE_MAX = 50;
const personMoviesCache = new Map();

export function clearTmdbPersonMoviesCache() {
  personMoviesCache.clear();
}

// A person's movies are fetched once per person, as Acting and Directing, and
// kept briefly so Change person and back does not refetch them.
export async function getTmdbPersonMovies(personId) {
  const id = Number(personId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid person");
  const cached = personMoviesCache.get(id);
  if (cached?.expiresAt > Date.now()) return cached.value;

  const request = apiGet(`/api/tmdb/search?type=person-movies&personId=${id}`).then((data) => ({
    acting: Array.isArray(data?.acting) ? data.acting : [],
    directing: Array.isArray(data?.directing) ? data.directing : [],
  }));
  personMoviesCache.set(id, { value: request, expiresAt: Date.now() + PERSON_MOVIES_CACHE_TTL_MS });
  if (personMoviesCache.size > PERSON_MOVIES_CACHE_MAX) {
    personMoviesCache.delete(personMoviesCache.keys().next().value);
  }
  // A failed fetch must not be served from the cache for five minutes.
  request.catch(() => {
    if (personMoviesCache.get(id)?.value === request) personMoviesCache.delete(id);
  });
  return request;
}

export async function getTmdbMovieDetails(id) {
  const tmdbId = String(id || "").trim();
  if (!tmdbId) throw new Error("Missing movie id");
  const cached = movieDetailsCache.get(tmdbId);
  if (cached?.expiresAt > Date.now()) return cached.value;
  if (movieDetailsInflight.has(tmdbId)) return movieDetailsInflight.get(tmdbId);

  const requestGeneration = movieDetailsGeneration;
  const request = apiGet(
    `/api/tmdb/movie/details?id=${encodeURIComponent(tmdbId)}`
  )
    .then((data) => {
      const value = {
        ...data,
        releaseStatus: getMovieReleaseStatus(data),
        trailer: selectBestTrailer(data?.videos?.results, {
          releaseDate: data?.release_date,
          title: data?.title,
        }),
      };
      if (requestGeneration === movieDetailsGeneration) {
        movieDetailsCache.set(tmdbId, {
          value,
          expiresAt: Date.now() + MOVIE_DETAILS_CACHE_TTL_MS,
        });
      }
      return value;
    })
    .finally(() => {
      if (requestGeneration === movieDetailsGeneration) {
        movieDetailsInflight.delete(tmdbId);
      }
    });

  movieDetailsInflight.set(tmdbId, request);
  return request;
}

export async function getTmdbMovieProviders(id, { region = "US" } = {}) {
  const tmdbId = String(id || "").trim();
  const normalizedRegion = String(region || "US").trim().toUpperCase();
  if (!tmdbId) return null;
  return apiGet(
    `/api/tmdb/movie/providers?id=${encodeURIComponent(tmdbId)}&region=${encodeURIComponent(normalizedRegion)}`
  );
}

export async function getTmdbMovieFilterMetadata(id) {
  const tmdbId = String(id || "").trim();
  if (!tmdbId) throw new Error("Missing movie id");
  return apiGet(`/api/tmdb/movie/filter-metadata?id=${encodeURIComponent(tmdbId)}`);
}

export async function warmTmdbMovieFilterMetadata(id, bowlId, accessToken) {
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !bowlId || !accessToken) {
    return null;
  }
  return apiPost(
    "/api/tmdb/movie/warm-filter-metadata",
    { id: tmdbId, bowlId },
    accessToken
  );
}

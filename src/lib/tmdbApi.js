import { selectOfficialTrailer } from "../utils/selectTrailer";
import { OFFLINE_MESSAGE, isOfflineError } from "../utils/networkErrors";

async function apiGet(url) {
  let response;
  try {
    response = await fetch(url);
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

export async function searchTmdbMovies(query) {
  const q = String(query || "").trim();
  if (!q) return { results: [] };
  return apiGet(`/api/tmdb/search?query=${encodeURIComponent(q)}`);
}

export async function getTmdbMovieDetails(id) {
  const tmdbId = String(id || "").trim();
  if (!tmdbId) throw new Error("Missing movie id");
  const data = await apiGet(`/api/tmdb/movie/details?id=${encodeURIComponent(tmdbId)}`);
  return {
    ...data,
    trailer: selectOfficialTrailer(data?.videos?.results),
  };
}

export async function getTmdbMovieProviders(id) {
  const tmdbId = String(id || "").trim();
  if (!tmdbId) return { results: {} };
  return apiGet(`/api/tmdb/movie/providers?id=${encodeURIComponent(tmdbId)}`);
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

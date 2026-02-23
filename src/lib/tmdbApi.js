async function apiGet(url) {
  const response = await fetch(url);
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
  return apiGet(`/api/tmdb/movie/details?id=${encodeURIComponent(tmdbId)}`);
}

export async function getTmdbMovieProviders(id) {
  const tmdbId = String(id || "").trim();
  if (!tmdbId) return { results: {} };
  return apiGet(`/api/tmdb/movie/providers?id=${encodeURIComponent(tmdbId)}`);
}

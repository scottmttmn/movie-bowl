const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function getTmdbToken() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing TMDB_READ_ACCESS_TOKEN env var");
  }
  return token;
}

export async function tmdbFetch(pathWithQuery) {
  const token = getTmdbToken();
  const response = await fetch(`${TMDB_BASE_URL}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.status_message || `TMDB request failed with ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return data;
}

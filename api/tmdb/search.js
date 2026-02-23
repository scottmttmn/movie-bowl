import { tmdbFetch } from "../_lib/tmdb.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const query = String(req.query?.query || "").trim();
  if (!query) {
    res.status(400).json({ error: "Missing query parameter: query" });
    return;
  }

  try {
    const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}`);
    res.status(200).json({ results: data?.results || [] });
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || "Failed to fetch TMDB search results" });
  }
}

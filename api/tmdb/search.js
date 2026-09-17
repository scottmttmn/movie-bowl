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

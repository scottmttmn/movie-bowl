import { tmdbFetch } from "../../_lib/tmdb.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = String(req.query?.id || "").trim();
  if (!id) {
    res.status(400).json({ error: "Missing query parameter: id" });
    return;
  }

  try {
    const data = await tmdbFetch(`/movie/${encodeURIComponent(id)}?append_to_response=release_dates`);
    res.status(200).json(data);
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || "Failed to fetch TMDB movie details" });
  }
}

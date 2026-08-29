import { fetchTmdbFilterMetadata } from "../../_lib/tmdbFilterMetadata.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid query parameter: id" });
    return;
  }

  try {
    const metadata = await fetchTmdbFilterMetadata(id, { region: "US" });
    res.status(200).json(metadata);
  } catch (error) {
    console.error("[api/tmdb/movie/filter-metadata] Failed to fetch filter metadata", error);
    const status = error?.statusCode || 500;
    res.status(status).json({ error: "Failed to fetch TMDB filter metadata" });
  }
}

import { tmdbFetch } from "../../_lib/tmdb.js";
import { normalizeTmdbWatchProviders } from "../../../src/utils/tmdbWatchProviders.js";

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

  const region = String(req.query?.region || "US").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) {
    res.status(400).json({ error: "Invalid query parameter: region" });
    return;
  }

  try {
    const data = await tmdbFetch(`/movie/${id}/watch/providers`);
    res.status(200).json(normalizeTmdbWatchProviders(data, { region }));
  } catch (error) {
    const status = error?.statusCode || 500;
    res.status(status).json({ error: error?.message || "Failed to fetch TMDB provider data" });
  }
}

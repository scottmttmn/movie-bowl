import { tmdbFetch } from "../../_lib/tmdb.js";
import { normalizeStreamingServices } from "../../../src/utils/streamingServices.js";

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
    const data = await tmdbFetch(
      `/movie/${encodeURIComponent(id)}?append_to_response=release_dates,watch/providers`
    );
    const providerResults = data?.["watch/providers"]?.results || {};
    const regionData = providerResults.US || {};
    const providers = normalizeStreamingServices([
      ...(regionData.flatrate || []),
      ...(regionData.ads || []),
    ].map((provider) => provider?.provider_name).filter(Boolean));
    const details = { ...(data || {}) };
    delete details["watch/providers"];

    res.status(200).json({
      details,
      providers,
      region: "US",
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[api/tmdb/movie/filter-metadata] Failed to fetch filter metadata", error);
    const status = error?.statusCode || 500;
    res.status(status).json({ error: "Failed to fetch TMDB filter metadata" });
  }
}

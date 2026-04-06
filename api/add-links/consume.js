import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

function normalizeGenres(genres) {
  if (!Array.isArray(genres)) return [];
  return genres
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .filter(Boolean);
}

function buildMoviePayload(movie) {
  const title = String(movie?.title || "").trim();
  if (!title) return null;

  const numericId = Number(movie?.tmdb_id ?? movie?.id);
  const tmdbId = Number.isInteger(numericId) && numericId > 0 ? numericId : null;

  return {
    tmdb_id: tmdbId,
    title,
    poster_path: movie?.poster_path ?? null,
    release_date: movie?.release_date ?? null,
    runtime: movie?.runtime ?? null,
    genres: normalizeGenres(movie?.genres),
    overview: movie?.overview ?? null,
    snapshot_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = String(req.body?.token || "").trim();
  const movie = buildMoviePayload(req.body?.movie);
  const contributorName = String(req.body?.contributorName || "");

  if (!token || !movie) {
    res.status(400).json({ error: "Missing token or movie payload." });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc("consume_bowl_add_link", {
      p_token: token,
      p_movie: movie,
      p_contributor_name: contributorName,
    });

    if (error) {
      const message = String(error?.message || "");
      if (
        message.toLowerCase().includes("not found") ||
        message.toLowerCase().includes("revoked") ||
        message.toLowerCase().includes("exhausted")
      ) {
        res.status(400).json({ error: message });
        return;
      }

      console.error("[api/add-links/consume] Failed to consume add link", error);
      res.status(500).json({ error: "Failed to add movie through link." });
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    res.status(200).json({
      ok: true,
      bowlId: row?.bowl_id ?? null,
      bowlName: row?.bowl_name ?? "Movie Bowl",
      remainingAdds: Number(row?.remaining_adds ?? 0),
      linkId: row?.link_id ?? null,
      movieId: row?.movie_id ?? null,
      addedByName: row?.added_by_name ?? "Link Guest",
    });
  } catch (error) {
    console.error("[api/add-links/consume] Unexpected error", error);
    res.status(500).json({ error: error?.message || "Failed to add movie through link." });
  }
}

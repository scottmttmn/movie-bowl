import { tmdbFetch } from "./tmdb.js";
import { getSupabaseAdmin } from "./supabaseAdmin.js";
import { normalizePersonMovieCredits } from "./personCredits.js";
import {
  bestPictureWinnersFor,
  choosePackPerson,
  getStarterPack,
  matchBestPictureWinner,
  selectFilmographyCandidates,
} from "../../src/utils/starterPacks.js";

// What a starter pack holds, asked of TMDB now and never stored: the design
// (output/designs/starter-packs.md, "Sourcing") keeps the pack as a rule and
// resolves its titles only for the request that installs them. TMDB confirmed
// that this is not a derivative, on those mechanics and with attribution.

class PackUnavailableError extends Error {}

function getBearerToken(req) {
  const authorization = String(req.headers?.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function toCandidate(movie) {
  return {
    id: Number(movie.id),
    title: movie.title || movie.original_title || "",
    release_date: movie.release_date || null,
    poster_path: movie.poster_path || null,
    popularity: Number(movie.popularity) || 0,
  };
}

async function filmographyCandidates(pack) {
  const search = await tmdbFetch(
    `/search/person?query=${encodeURIComponent(pack.person)}&page=1&language=en-US&include_adult=false`
  );
  const chosen = choosePackPerson(pack, search?.results);
  if (!chosen.person) throw new PackUnavailableError(chosen.error);
  const credits = await tmdbFetch(`/person/${Number(chosen.person.id)}/movie_credits?language=en-US`);
  return selectFilmographyCandidates(pack, normalizePersonMovieCredits(credits));
}

async function bestPictureCandidates(pack) {
  const winners = bestPictureWinnersFor(pack.decade);
  const matches = await Promise.all(winners.map(async (winner) => {
    const search = await tmdbFetch(
      `/search/movie?query=${encodeURIComponent(winner.title)}&page=1&language=en-US&include_adult=false`
    );
    return matchBestPictureWinner(winner, search?.results);
  }));
  // One winner that cannot be matched fails the pack loudly: a Best Picture
  // decade with a film silently missing, or the wrong film in its place, is
  // worse than a pack that says it is unavailable.
  const failure = matches.find((match) => !match.movie);
  if (failure) throw new PackUnavailableError(failure.error);
  return matches.map((match) => match.movie);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pack = getStarterPack(String(req.query?.pack || ""));
  if (!pack) {
    res.status(400).json({ error: "Unknown starter pack" });
    return;
  }

  // Signed-in only: a pack is installed by a bowl's owner, and an open route
  // would let anyone spend TMDB requests on it.
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const { data: authData, error: authError } = await getSupabaseAdmin().auth.getUser(token);
    if (authError || !authData?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const movies = pack.kind === "best-picture"
      ? await bestPictureCandidates(pack)
      : await filmographyCandidates(pack);
    res.status(200).json({
      pack: { slug: pack.slug, name: pack.name },
      candidates: movies.map(toCandidate),
    });
  } catch (error) {
    if (error instanceof PackUnavailableError) {
      console.error(`[api/starter-packs/candidates] ${pack.slug} is unavailable: ${error.message}`);
      res.status(409).json({ error: `The ${pack.name} pack is unavailable right now.` });
      return;
    }
    console.error("[api/starter-packs/candidates] Failed to resolve a starter pack", error);
    res.status(502).json({ error: "Failed to load the starter pack" });
  }
}

import { supabase } from "./supabase";
import { getTmdbMovieDetails } from "./tmdbApi";
import { notifyBowlChange } from "./bowlChanges";
import { STARTER_PACK_MAX_SLIPS, getStarterPack, sampleStarterPackCandidates } from "../utils/starterPacks";
import { OFFLINE_MESSAGE, describeNetworkError, isOffline } from "../utils/networkErrors";

// Installing a pack, in the order output/designs/starter-packs.md sets out:
// the server resolves the pack's candidates from TMDB for this request only,
// the client samples which to offer and looks each one up through the normal
// details path, and the database enforces every limit. Nothing here warms
// provider links or filter metadata; the daily refresh picks pack titles up.

// The database's own refusals and the candidate route's errors are written for
// people; anything else (a dropped request, a TypeError) gets the fallback.
const USER_FACING_CODES = new Set(["P0001", "42501", "22023"]);
function userFacing(message) {
  return Object.assign(new Error(message), { userFacing: true });
}
function describeFailure(error, fallback) {
  if (error?.userFacing || USER_FACING_CODES.has(error?.code)) return error.message;
  return describeNetworkError(error, fallback);
}

async function getAccessToken(client) {
  const { data, error } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) throw userFacing("Sign in again to add a starter pack.");
  return token;
}

export async function fetchStarterPackCandidates(slug, { client = supabase, fetchImpl = fetch } = {}) {
  const token = await getAccessToken(client);
  const response = await fetchImpl(`/api/starter-packs/candidates?pack=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw userFacing(body?.error || "Could not load that starter pack. Please try again.");
  return Array.isArray(body?.candidates) ? body.candidates : [];
}

function toSnapshot(candidate, details) {
  return {
    tmdb_id: Number(candidate.id),
    title: details?.title || candidate.title,
    poster_path: details?.poster_path ?? candidate.poster_path ?? null,
    release_date: details?.release_date || candidate.release_date || null,
    runtime: Number.isInteger(details?.runtime) && details.runtime > 0 ? details.runtime : null,
    genres: (Array.isArray(details?.genres) ? details.genres : [])
      .map((genre) => (typeof genre === "string" ? genre : genre?.name))
      .filter(Boolean),
    overview: details?.overview || null,
  };
}

function titleCount(count) {
  return `${count} ${count === 1 ? "title" : "titles"}`;
}

/**
 * Installs a pack, or tops up the installed one. `heldTmdbIds` is every title
 * the bowl holds or has drawn, and `packSlipCount` how many undrawn pack
 * titles it has now; both only steer the sample, since the database has the
 * final say on duplicates and limits.
 */
export async function installStarterPack({
  bowlId,
  slug,
  heldTmdbIds = [],
  packSlipCount = 0,
  client = supabase,
  fetchCandidates = fetchStarterPackCandidates,
  getDetails = getTmdbMovieDetails,
  randomFn = Math.random,
  offline = isOffline,
  publish = notifyBowlChange,
}) {
  const pack = getStarterPack(slug);
  if (!pack) return { ok: false, message: "That starter pack is not available." };
  if (offline()) return { ok: false, message: OFFLINE_MESSAGE };
  const room = STARTER_PACK_MAX_SLIPS - packSlipCount;
  if (room <= 0) {
    return { ok: false, message: `The bowl already holds ${STARTER_PACK_MAX_SLIPS} titles from this pack.` };
  }

  try {
    const candidates = await fetchCandidates(slug, { client });
    const sample = sampleStarterPackCandidates(candidates, { excludeTmdbIds: heldTmdbIds, count: room, randomFn });
    if (sample.length === 0) {
      return { ok: false, code: "pack_exhausted", message: `Everything in the ${pack.name} pack has already been in this bowl.` };
    }

    // One title whose details will not load is left out rather than failing
    // the pack; an install where none load has nothing to add.
    const settled = await Promise.allSettled(sample.map((candidate) => getDetails(candidate.id)));
    const movies = sample
      .map((candidate, index) => (settled[index].status === "fulfilled" ? toSnapshot(candidate, settled[index].value) : null))
      .filter(Boolean);
    if (movies.length === 0) throw userFacing("No starter pack titles could be loaded. Please try again.");

    const { data, error } = await client.rpc("install_bowl_starter_pack", {
      p_bowl_id: bowlId,
      p_pack_slug: pack.slug,
      p_pack_name: pack.name,
      p_movies: movies,
    });
    if (error) throw error;

    const inserted = Array.isArray(data?.inserted) ? data.inserted.length : 0;
    if (inserted > 0) publish({ type: "context", bowlId });
    const skipped = (data?.already_in_bowl?.length || 0) + (data?.over_limit?.length || 0);
    if (inserted === 0) {
      return { ok: false, code: "nothing_added", message: `Nothing new was added from the ${pack.name} pack.` };
    }
    return {
      ok: true,
      inserted,
      message: skipped > 0
        ? `Added ${titleCount(inserted)} from the ${pack.name} pack. ${skipped} ${skipped === 1 ? "was" : "were"} already in the bowl or over the limit.`
        : `Added ${titleCount(inserted)} from the ${pack.name} pack.`,
    };
  } catch (error) {
    console.error("[starterPacks] Failed to install a starter pack", error);
    return { ok: false, message: describeFailure(error, "Could not add the starter pack. Please try again.") };
  }
}

export async function removeStarterPack({ bowlId, client = supabase, offline = isOffline, publish = notifyBowlChange }) {
  if (offline()) return { ok: false, message: OFFLINE_MESSAGE };
  const { data, error } = await client.rpc("remove_bowl_starter_pack", { p_bowl_id: bowlId });
  if (error) {
    console.error("[starterPacks] Failed to remove a starter pack", error);
    return { ok: false, message: describeFailure(error, "Could not remove the starter pack. Please try again.") };
  }
  publish({ type: "context", bowlId });
  const removed = Number(data) || 0;
  return {
    ok: true,
    removed,
    message: removed > 0
      ? `Removed the pack and its ${titleCount(removed)} still in the bowl.`
      : "Removed the pack.",
  };
}

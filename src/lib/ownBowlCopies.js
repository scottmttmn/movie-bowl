import { supabase } from "./supabase";

const REMOVE_ERROR = "Could not remove it from your bowls. Please try again.";

/**
 * Finds the copies of a title you could still take out of your bowls.
 *
 * Only your own undrawn slips are offered. RLS would let a bowl owner delete
 * anyone's row, but silently dropping someone else's title would also shift
 * person-first odds for the whole bowl with no visible cause.
 *
 * A manual entry can only look these up by `tmdb_id`, which custom titles do
 * not usefully have: their negative synthetic ids are unique per row, so a
 * lookup by id finds nothing and the slip stays in the bowl with nothing on
 * screen to explain it. A solo draw knows the row it drew, so passing
 * `bowlMovieId` covers that case, and merging the two by row id keeps the
 * source copy from being offered twice.
 */
export async function findOwnUndrawnBowlCopies({ tmdbId = null, bowlMovieId = null } = {}) {
  const positiveTmdbId = Number.isInteger(Number(tmdbId)) && Number(tmdbId) > 0
    ? Number(tmdbId)
    : null;
  if (!positiveTmdbId && !bowlMovieId) return [];

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    if (authError || !user) return [];

    const lookups = [];
    if (positiveTmdbId) {
      lookups.push(
        supabase
          .from("bowl_movies")
          .select("id, bowl_id")
          .eq("added_by", user.id)
          .eq("tmdb_id", positiveTmdbId)
          .is("drawn_at", null)
      );
    }
    if (bowlMovieId) {
      lookups.push(
        supabase
          .from("bowl_movies")
          .select("id, bowl_id")
          .eq("added_by", user.id)
          .eq("id", bowlMovieId)
          .is("drawn_at", null)
      );
    }

    const responses = await Promise.all(lookups);
    const matchesById = new Map();

    for (const { data, error } of responses) {
      if (error) {
        console.error("[ownBowlCopies] Failed to look up bowl copies", error);
        return [];
      }
      (data || []).forEach((match) => matchesById.set(match.id, match));
    }

    const matches = [...matchesById.values()];
    if (matches.length === 0) return [];

    const { data: bowlRows, error: bowlsError } = await supabase
      .from("bowls")
      .select("id, name")
      .in("id", [...new Set(matches.map((match) => match.bowl_id))]);

    if (bowlsError) {
      console.error("[ownBowlCopies] Failed to load bowl names", bowlsError);
      return [];
    }

    const bowlNames = new Map((bowlRows || []).map((bowl) => [bowl.id, bowl.name]));

    return matches
      .filter((match) => bowlNames.has(match.bowl_id))
      .map((match) => ({
        id: match.id,
        bowlId: match.bowl_id,
        bowlName: bowlNames.get(match.bowl_id),
      }));
  } catch (error) {
    // The offer is a convenience on top of a saved entry, so a failed lookup
    // degrades to not offering it rather than breaking the save.
    console.error("[ownBowlCopies] Unexpected error looking up bowl copies", error);
    return [];
  }
}

/**
 * Deletes the chosen copies, re-asserting ownership and undrawn state in the
 * statement itself: the list was built before the dialog opened, and a copy
 * somebody drew in the meantime is no longer yours to remove.
 */
export async function removeOwnBowlCopies(bowlMovieIds) {
  const targetIds = (bowlMovieIds || []).filter(Boolean);
  if (targetIds.length === 0) {
    return { ok: false, code: "empty", message: REMOVE_ERROR, userId: null };
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    if (authError || !user) {
      return { ok: false, code: "unauthenticated", message: REMOVE_ERROR, userId: null };
    }

    const { error } = await supabase
      .from("bowl_movies")
      .delete()
      .in("id", targetIds)
      .eq("added_by", user.id)
      .is("drawn_at", null);

    if (error) {
      console.error("[ownBowlCopies] Failed to remove movie from bowls", error);
      return { ok: false, code: error.code || "error", message: REMOVE_ERROR, userId: user.id };
    }

    return { ok: true, code: null, message: "", userId: user.id };
  } catch (error) {
    console.error("[ownBowlCopies] Unexpected error removing movie from bowls", error);
    return { ok: false, code: "unexpected", message: REMOVE_ERROR, userId: null };
  }
}

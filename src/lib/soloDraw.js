import { supabase } from "./supabase";
import { getBrowserTimeZone } from "../utils/getBrowserTimeZone";

const SAVE_ERROR = "Could not save this draw. Please try again.";

/**
 * The id that makes a retried save the same draw.
 *
 * `record_solo_draw` returns the original entry when it sees a request id it
 * has already recorded, so the caller must hold one id across every attempt at
 * a single draw and only mint a new one for a new draw. A save whose answer
 * never arrived is the case this exists for: retrying with the same id returns
 * the pick that was already committed instead of spending a second one.
 */
export function createSoloDrawRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Older WebViews -- the Google TV shell among them -- have crypto without
  // randomUUID. Uniqueness per user is all the unique index asks for.
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`;
}

/**
 * Commits a solo draw to personal history. The bowl is untouched.
 *
 * Returns a result object rather than throwing, per the house convention: the
 * screen renders `message` verbatim.
 */
export async function recordSoloDraw(bowlMovieId, requestId) {
  if (!bowlMovieId || !requestId) {
    return { ok: false, code: "invalid", message: SAVE_ERROR, event: null };
  }

  try {
    const { data, error } = await supabase.rpc("record_solo_draw", {
      p_bowl_movie_id: bowlMovieId,
      p_watched_timezone: getBrowserTimeZone(),
      p_request_id: requestId,
    });

    if (error) {
      console.error("[soloDraw] Failed to record a solo draw", error);
      // The server's own refusals say something true about this title -- it was
      // drawn, removed, or is in a bowl you have left -- so they are worth
      // showing. Anything else is infrastructure and gets the generic line.
      const message = error.code === "P0001" && error.message ? error.message : SAVE_ERROR;
      return { ok: false, code: error.code || "error", message, event: null };
    }

    const event = Array.isArray(data) ? data[0] : data;
    if (!event?.id) {
      console.error("[soloDraw] Solo draw returned no history entry", data);
      return { ok: false, code: "empty", message: SAVE_ERROR, event: null };
    }

    return { ok: true, code: null, message: "", event };
  } catch (error) {
    console.error("[soloDraw] Unexpected error recording a solo draw", error);
    return { ok: false, code: "unexpected", message: SAVE_ERROR, event: null };
  }
}

const UNDO_ERROR = "Could not undo this draw. Please try again.";

/**
 * The copies a solo draw took out of your bowls, if the setting was on.
 *
 * Read rather than returned by the draw: `record_solo_draw` returns the watch
 * entry, and the snapshot rows are the server's own record of what it removed.
 * A failed read degrades to saying nothing about removals rather than blocking
 * a draw that has already committed.
 */
export async function fetchSoloDrawRemovedCopies(eventId) {
  if (!eventId) return [];

  try {
    const { data, error } = await supabase
      .from("solo_draw_removed_copies")
      .select("bowl_movie_id, bowl_id, bowl_name, title")
      .eq("watch_event_id", eventId)
      .order("bowl_name", { ascending: true });

    if (error) {
      console.error("[soloDraw] Failed to read the copies a draw removed", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.bowl_movie_id,
      bowlId: row.bowl_id,
      bowlName: row.bowl_name,
      title: row.title,
    }));
  } catch (error) {
    console.error("[soloDraw] Unexpected error reading removed copies", error);
    return [];
  }
}

/**
 * Undoes a solo draw: deletes the entry and restores the copies it removed.
 *
 * The two-hour window and the ownership of every copy are the server's to
 * enforce, so this reports what came back rather than deciding it. `skipped`
 * names the copies that could not go back -- their bowl is gone, access to it
 * is gone, or another copy of the title has taken the place.
 */
export async function undoSoloDraw(eventId) {
  if (!eventId) {
    return { ok: false, code: "invalid", message: UNDO_ERROR, restored: 0, skipped: [] };
  }

  try {
    const { data, error } = await supabase.rpc("undo_solo_draw", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("[soloDraw] Failed to undo a solo draw", error);
      const message = error.code === "P0001" && error.message ? error.message : UNDO_ERROR;
      return { ok: false, code: error.code || "error", message, restored: 0, skipped: [] };
    }

    const result = Array.isArray(data) ? data[0] : data;
    return {
      ok: true,
      code: null,
      message: "",
      restored: Number(result?.restored) || 0,
      skipped: Array.isArray(result?.skipped) ? result.skipped : [],
    };
  } catch (error) {
    console.error("[soloDraw] Unexpected error undoing a solo draw", error);
    return { ok: false, code: "unexpected", message: UNDO_ERROR, restored: 0, skipped: [] };
  }
}

/**
 * The one line that says what an undo did, when it did not simply work.
 *
 * Silence is right when everything went back, because the bowls themselves are
 * the answer. A copy that could not go back has to be said out loud: nothing
 * else on screen will ever explain the gap.
 */
export function describeSkippedRestores(skipped) {
  const entries = (skipped || []).filter((entry) => entry?.bowl_name);
  if (entries.length === 0) return "";

  const bowls = [...new Set(entries.map((entry) => entry.bowl_name))];
  const named = bowls.length > 2
    ? `${bowls.slice(0, 2).join(", ")} and ${bowls.length - 2} more`
    : bowls.join(" and ");

  return entries.length === 1
    ? `The copy in ${named} could not go back, so it stays removed.`
    : `${entries.length} copies could not go back, in ${named}. They stay removed.`;
}

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

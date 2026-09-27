import { supabase } from "./supabase";
import { getMovieNoteValidationError, normalizeMovieNote } from "../utils/movieNote";

const SAVE_ERROR = "Could not save your comment. Please try again.";

/**
 * Finds your own history entry for one bowl draw, so the bowl page can show
 * the comment you wrote about it.
 *
 * Resolves to null when you were not part of that draw -- or when the lookup
 * fails. Either way the bowl page shows no comment row, which costs nothing
 * the bowl itself needs; the entry is still in your Watch List.
 */
export async function fetchOwnDrawWatchEntry(drawEventId) {
  if (!drawEventId) return null;

  try {
    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    if (authError || !user) return null;

    const { data, error } = await supabase
      .from("user_watch_events")
      .select("id, personal_note")
      .eq("user_id", user.id)
      .eq("source_kind", "bowl_draw")
      .eq("source_draw_event_id", drawEventId)
      .maybeSingle();

    if (error) {
      console.error("[watchComments] Failed to load your history entry", error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error("[watchComments] Unexpected error loading your history entry", error);
    return null;
  }
}

/**
 * Sets your own comment on one of your own history entries. Never touches why
 * the movie was in the bowl, and never the title or date you gave the entry.
 */
export async function updateOwnWatchComment(entryId, note) {
  if (!entryId) return { ok: false, message: SAVE_ERROR };

  const validationError = getMovieNoteValidationError(note);
  if (validationError) return { ok: false, message: validationError };

  try {
    const { data, error } = await supabase.rpc("update_own_watch_event_note", {
      p_event_id: entryId,
      p_note: normalizeMovieNote(note),
    });

    if (error) {
      console.error("[watchComments] Failed to save comment", error);
      return { ok: false, message: error.message || SAVE_ERROR };
    }

    const event = Array.isArray(data) ? data[0] : data;
    return { ok: true, note: normalizeMovieNote(event?.personal_note) };
  } catch (error) {
    console.error("[watchComments] Unexpected error saving comment", error);
    return { ok: false, message: SAVE_ERROR };
  }
}

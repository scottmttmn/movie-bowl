import { supabase } from "./supabase";
import { addResult } from "./addBowlMovie";
import { notifyBowlChange } from "./bowlChanges";
import { getMovieNoteValidationError, normalizeMovieNote } from "../utils/movieNote";
import { OFFLINE_MESSAGE, describeNetworkError, isOffline, isOfflineError } from "../utils/networkErrors";

function actionError(error, action) {
  if (isOfflineError(error)) return addResult(false, "offline", OFFLINE_MESSAGE);
  if (error?.code === "42501") return addResult(false, "access_lost", "You no longer have permission to change this movie.");
  if (/no longer available/i.test(error?.message || "")) {
    return addResult(false, "movie_unavailable", action === "comment"
      ? "This comment is no longer available to edit. The movie may already have been drawn."
      : "This movie is no longer available to remove. It may already have been drawn or removed.");
  }
  return addResult(false, "update_failed", describeNetworkError(error, action === "comment"
    ? "Could not save this comment. Please try again."
    : "Could not confirm removal. Please try again."));
}

export function createBowlMovieActions({ client = supabase, offline = isOffline, publish = notifyBowlChange } = {}) {
  async function perform(action, operation) {
    const { accountId, bowlId, movieId, note } = operation;
    const current = () => operation.isCurrent?.() !== false;
    if (!bowlId || !movieId) return addResult(false, "invalid_movie", "Choose a movie to change.");
    if (action === "comment") {
      const error = getMovieNoteValidationError(note);
      if (error) return addResult(false, "comment_too_long", error);
    }
    if (offline()) return addResult(false, "offline", OFFLINE_MESSAGE);
    try {
      const { data: auth, error: authError } = await client.auth.getSession();
      if (authError || !accountId || auth?.session?.user?.id !== accountId || !current()) {
        return addResult(false, "not_authenticated", "Your account changed. Reopen Add a movie to continue.");
      }
      const { data, error } = action === "comment"
        ? await client.rpc("update_own_bowl_movie_note", { p_bowl_movie_id: movieId, p_note: normalizeMovieNote(note) })
        : await client.from("bowl_movies").delete().eq("id", movieId).eq("bowl_id", bowlId)
          .eq("added_by", accountId).is("drawn_at", null).select("id");
      if (error) throw error;
      const movie = Array.isArray(data) ? data[0] : data;
      // A DELETE can succeed with zero affected rows after access loss or a draw.
      // Only a returned row confirms that this action actually changed a movie.
      if (movie?.id !== movieId) throw new Error("This movie is no longer available.");
      if (!current()) return addResult(false, "not_authenticated", "Your account changed. Reopen Add a movie to continue.");
      publish({ type: "movie", action, userId: accountId, bowlId, movieId, movie });
      return { ...addResult(true), movie };
    } catch (error) {
      if (current()) publish({ type: "context", userId: accountId, bowlId });
      return actionError(error, action);
    }
  }
  return {
    updateNote: (operation) => perform("comment", operation),
    remove: (operation) => perform("remove", operation),
  };
}

export const bowlMovieActions = createBowlMovieActions();

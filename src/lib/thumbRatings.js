import { supabase } from "./supabase";
import { normalizeRating } from "../utils/thumbRatings";

const SAVE_ERROR = "Could not save your rating. Please try again.";

/**
 * Your own ratings, as rows the database keys them by. Resolves to null when
 * the read fails, so a page can leave the thumbs out rather than show every
 * movie as unrated and invite a rating over one it could not see.
 */
export async function fetchMyMovieRatings() {
  try {
    const { data, error } = await supabase
      .from("user_movie_ratings")
      .select("tmdb_id, watch_event_id, rating");

    if (error) {
      console.error("[thumbRatings] Failed to load your ratings", error);
      return null;
    }

    return data || [];
  } catch (error) {
    console.error("[thumbRatings] Unexpected error loading your ratings", error);
    return null;
  }
}

/**
 * Rates the movie one of your history entries is about, or clears it with
 * null. Every entry of the same TMDB movie shares the rating.
 */
export async function saveMyMovieRating(entryId, rating) {
  if (!entryId) return { ok: false, message: SAVE_ERROR };

  try {
    const { data, error } = await supabase.rpc("set_my_movie_rating", {
      p_watch_event_id: entryId,
      p_rating: rating ?? null,
    });

    if (error) {
      console.error("[thumbRatings] Failed to save rating", error);
      return { ok: false, message: SAVE_ERROR };
    }

    return { ok: true, rating: normalizeRating(data?.rating) };
  } catch (error) {
    console.error("[thumbRatings] Unexpected error saving rating", error);
    return { ok: false, message: SAVE_ERROR };
  }
}

/**
 * The thumbs on a bowl's watched movies. Resolves to null on failure; the bowl
 * page then shows no thumbs at all rather than a bowl nobody has rated.
 */
export async function fetchBowlWatchedRatings(bowlId) {
  if (!bowlId) return null;

  try {
    const { data, error } = await supabase.rpc("get_bowl_watched_ratings", {
      p_bowl_id: bowlId,
    });

    if (error) {
      console.error("[thumbRatings] Failed to load the bowl's ratings", error);
      return null;
    }

    return data || [];
  } catch (error) {
    console.error("[thumbRatings] Unexpected error loading the bowl's ratings", error);
    return null;
  }
}

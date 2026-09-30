import { supabase } from "./supabase";
import { readAllRows } from "./readAllRows";

/**
 * Everything the add sheet needs to mark search results, in two reads: the
 * undrawn TMDB slips across your bowls, and the TMDB titles in your own watch
 * history. Both are rows row-level security already lets you read. Resolves to
 * `{ slips, watchEvents }`, or throws, and the sheet then marks nothing.
 */
export async function fetchSearchMarkSources({ userId, bowlIds, client = supabase }) {
  if (!userId || bowlIds.length === 0) return { slips: [], watchEvents: [] };
  const [slips, watchEvents] = await Promise.all([
    readAllRows(() => client
      .from("bowl_movies")
      .select("id, bowl_id, tmdb_id, added_by, starter_pack")
      .in("bowl_id", bowlIds)
      .is("drawn_at", null)
      .gt("tmdb_id", 0)
      .order("id", { ascending: true })),
    readAllRows(() => client
      .from("user_watch_events")
      .select("id, tmdb_id, watched_on")
      .eq("user_id", userId)
      .gt("tmdb_id", 0)
      .order("id", { ascending: true })),
  ]);
  if (slips.error) throw slips.error;
  if (watchEvents.error) throw watchEvents.error;
  return { slips: slips.data, watchEvents: watchEvents.data };
}

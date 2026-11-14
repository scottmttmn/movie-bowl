import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBowlWatchedRatings, saveMyMovieRating } from "../lib/thumbRatings";
import { groupBowlRatings } from "../utils/thumbRatings";

/**
 * The thumbs on a bowl's watched movies, grouped by draw. `groups` is null
 * until read and after a failed read, so the bowl shows no thumbs at all
 * rather than a bowl nobody has rated. A null bowl id reads nothing.
 *
 * `watchedKey` changes whenever the watched list does, which is when a draw,
 * a return or a removal can change what there is to rate.
 */
export default function useBowlWatchedRatings(bowlId, watchedKey) {
  // Held with the bowl it was read for, so another bowl's thumbs never show
  // while this one's are on their way.
  const [loaded, setLoaded] = useState({ bowlId: null, groups: null });
  const sequence = useRef(0);

  const reload = useCallback(async () => {
    if (!bowlId) return;
    const current = ++sequence.current;
    const rows = await fetchBowlWatchedRatings(bowlId);
    if (current !== sequence.current) return;
    setLoaded({ bowlId, groups: rows ? groupBowlRatings(rows) : null });
  }, [bowlId]);

  useEffect(() => {
    if (!bowlId) return;
    const current = ++sequence.current;
    fetchBowlWatchedRatings(bowlId).then((rows) => {
      if (current !== sequence.current) return;
      setLoaded({ bowlId, groups: rows ? groupBowlRatings(rows) : null });
    });
  }, [bowlId, watchedKey]);

  const groups = bowlId && loaded.bowlId === bowlId ? loaded.groups : null;

  // Your own thumb moves at once; the read after it is what turns the others
  // over, because the database only tells you what they picked once you have
  // picked too.
  const rate = useCallback(async (drawEventId, entryId, rating) => {
    const before = loaded;
    setLoaded((current) => {
      if (!current.groups) return current;
      const next = new Map(current.groups);
      const group = next.get(drawEventId) || { mine: null, others: [] };
      next.set(drawEventId, { ...group, mine: rating });
      return { ...current, groups: next };
    });

    const result = await saveMyMovieRating(entryId, rating);
    if (!result.ok) {
      sequence.current += 1;
      setLoaded(before);
      return result;
    }

    await reload();
    return result;
  }, [loaded, reload]);

  return { groups, rate, reload };
}

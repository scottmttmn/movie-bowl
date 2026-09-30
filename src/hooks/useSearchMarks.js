import { useEffect, useMemo, useState } from "react";
import { fetchSearchMarkSources } from "../lib/searchMarkSources";
import { buildSearchMarks, getSearchMark } from "../utils/searchMarks";

/**
 * Marks for the add sheet's search results, read once each time the sheet
 * opens. Titles added while it is open join from `additions`, so a second
 * search for the same film already shows it in the bowl.
 *
 * Until the reads land, or if they fail, nothing is marked: every result keeps
 * its +, and the add itself still refuses a duplicate, as it did before marks.
 */
export default function useSearchMarks({ sessionKey, open, userId, bowls, bowlId, additions = [] }) {
  const [loaded, setLoaded] = useState(null);
  const bowlIds = bowls.map((bowl) => bowl.id).join(",");
  // A read belongs to one opening of the sheet; last time's is never shown.
  const requestKey = `${sessionKey}|${userId}|${bowlIds}`;
  const sources = open && loaded?.key === requestKey ? loaded.sources : null;

  useEffect(() => {
    if (!open || !userId || !bowlIds) return undefined;
    let current = true;
    fetchSearchMarkSources({ userId, bowlIds: bowlIds.split(",") })
      .then((result) => { if (current) setLoaded({ key: requestKey, sources: result }); })
      .catch((error) => {
        console.error("[useSearchMarks] Failed to load search marks", error);
      });
    return () => { current = false; };
  }, [requestKey, open, userId, bowlIds]);

  const marks = useMemo(() => {
    if (!sources || !bowlId) return null;
    const added = additions.map((entry) => ({
      bowl_id: entry.bowlId, tmdb_id: entry.movie?.tmdb_id, added_by: userId, starter_pack: false,
    }));
    return buildSearchMarks({ bowlId, userId, bowls, slips: [...sources.slips, ...added], watchEvents: sources.watchEvents });
  }, [sources, bowlId, userId, bowls, additions]);

  const destination = bowls.find((bowl) => bowl.id === bowlId) || null;
  return useMemo(() => (marks ? (movie) => {
    const mark = getSearchMark(marks, movie);
    return mark?.kind === "in_bowl" ? { ...mark, bowl: destination } : mark;
  } : null), [marks, destination]);
}

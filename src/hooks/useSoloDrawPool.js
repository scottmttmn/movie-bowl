import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { BOWL_MOVIE_FIELDS } from "../lib/addBowlMovie";
import { getSoloScopeCounts } from "../utils/soloDrawSelection";

const LOAD_ERROR = "Could not load your movies. Please try again.";

/**
 * Reads every undrawn title you added, across every bowl you can still reach.
 *
 * This is the cross-bowl pool `guest-night.md` names as the missing primitive,
 * and for one person it needs no RPC: `bowl_movies_select_members` already
 * grants select on rows in bowls you own or belong to, so scoping to
 * `added_by = you` returns exactly your own pool and nothing else. Titles added
 * through a public link carry a name but no `added_by`, so the same predicate
 * leaves them out — they are not yours to draw.
 *
 * Bowl names come from a second read rather than a join, matching the Watch
 * List's lookup, and a bowl that no longer resolves drops out of the scope
 * selector instead of appearing nameless.
 */
export default function useSoloDrawPool(userId, { enabled = true } = {}) {
  const [state, setState] = useState({ rows: [], bowls: [], isLoading: true, errorMessage: "" });
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    if (!userId || !enabled) {
      setState({ rows: [], bowls: [], isLoading: false, errorMessage: "" });
      return;
    }

    const request = ++generation.current;
    setState((previous) => ({ ...previous, isLoading: true, errorMessage: "" }));

    try {
      const { data: movieRows, error: movieError } = await supabase
        .from("bowl_movies")
        .select(BOWL_MOVIE_FIELDS)
        .eq("added_by", userId)
        .is("drawn_at", null);

      if (movieError) throw movieError;

      const rows = movieRows || [];
      const bowlIds = [...new Set(rows.map((row) => row.bowl_id).filter(Boolean))];
      let bowlRows = [];

      if (bowlIds.length > 0) {
        const { data, error: bowlsError } = await supabase
          .from("bowls")
          .select("id, name")
          .in("id", bowlIds);

        if (bowlsError) throw bowlsError;
        bowlRows = data || [];
      }

      const counts = getSoloScopeCounts(rows);
      const bowlNames = new Map(bowlRows.map((bowl) => [bowl.id, bowl.name]));
      const bowls = bowlRows
        .map((bowl) => ({
          id: bowl.id,
          name: bowl.name,
          titleCount: counts.get(bowl.id) || 0,
        }))
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));

      if (!mounted.current || request !== generation.current) return;

      setState({
        rows: rows.filter((row) => bowlNames.has(row.bowl_id)),
        bowls,
        isLoading: false,
        errorMessage: "",
      });
    } catch (error) {
      if (!mounted.current || request !== generation.current) return;
      console.error("[useSoloDrawPool] Failed to load your cross-bowl pool", error);
      // A failed read is an error with Retry, never an empty pool: telling
      // someone they have nothing to draw when the network blinked would send
      // them off to add movies they already have.
      setState({ rows: [], bowls: [], isLoading: false, errorMessage: LOAD_ERROR });
    }
  }, [userId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Drops copies the server has already removed, without reading again.
   *
   * A solo draw under "remove my copies" deletes exactly these rows, and it
   * reports their ids, so the pool can be brought back in step from what the
   * draw already knows. Refetching would do the same work over the network and,
   * if that read blinked, would replace a correct pool with an error.
   */
  const removeRows = useCallback((movieIds) => {
    const removed = new Set((movieIds || []).filter(Boolean));
    if (removed.size === 0) return;

    setState((previous) => {
      const rows = previous.rows.filter((row) => !removed.has(row.id));
      if (rows.length === previous.rows.length) return previous;

      // A bowl you have no undrawn titles left in never appears in a freshly
      // loaded pool, so it leaves the scope selector here too.
      const counts = getSoloScopeCounts(rows);
      return {
        ...previous,
        rows,
        bowls: previous.bowls
          .filter((bowl) => counts.has(bowl.id))
          .map((bowl) => ({ ...bowl, titleCount: counts.get(bowl.id) })),
      };
    });
  }, []);

  const bowlIds = useMemo(() => state.bowls.map((bowl) => bowl.id), [state.bowls]);

  return {
    rows: state.rows,
    bowls: state.bowls,
    bowlIds,
    isLoading: state.isLoading,
    errorMessage: state.errorMessage,
    reload: load,
    removeRows,
  };
}

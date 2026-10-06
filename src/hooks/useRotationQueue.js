import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * The order a rotation bowl's next draw would rank its eligible people in,
 * read from the database's own ranking, which is the only one that counts
 * returned and removed draws. It is a readout and never an input: the draw
 * ranks again inside its own lock, so two devices still cannot award the same
 * turn twice.
 *
 * Read only while `enabled`, and only once the eligible pool is known -- the
 * filters can take someone out of line. `status` is "idle" when there is
 * nothing to ask, "loading", "ready" with `queue`, or "error", which callers
 * treat as no order rather than a guessed one.
 */
const IDLE = { status: "idle", queue: null };
const LOADING = { status: "loading", queue: null };

export default function useRotationQueue(bowlId, candidateMovieIds, { enabled = false, refreshKey = null } = {}) {
  const idsKey = Array.isArray(candidateMovieIds) ? [...candidateMovieIds].map(String).sort().join(",") : null;
  const key = `${bowlId}|${idsKey}|${refreshKey}`;
  const active = Boolean(enabled && bowlId && idsKey !== null);
  const [state, setState] = useState({ key: null, bowlId: null, status: "idle", queue: null });

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    supabase
      .rpc("get_bowl_rotation_queue", {
        p_bowl_id: bowlId,
        p_candidate_movie_ids: idsKey ? idsKey.split(",") : [],
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[useRotationQueue] Failed to load the rotation order", error);
          setState({ key, bowlId, status: "error", queue: null });
          return;
        }
        setState({ key, bowlId, status: "ready", queue: Array.isArray(data) ? data : [] });
      });
    return () => {
      cancelled = true;
    };
  }, [active, bowlId, idsKey, key]);

  if (!active) return IDLE;
  if (state.key === key) return state;
  // A re-read for the same bowl -- a draw, a filter change -- keeps showing
  // the last order until the new one lands, so the list does not blank out
  // and refill under the reader. Another bowl's order is never shown.
  if (state.bowlId === bowlId && state.status === "ready") return state;
  return LOADING;
}

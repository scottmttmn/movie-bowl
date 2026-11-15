import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPlaceHours as defaultGetPlaceHours } from "../lib/placesSearch";

// Opening hours for a restaurant bowl's slips, for the Open filter. Each
// lookup spends a monthly allowance, so nothing is asked until someone turns
// the filter on, and an answer is held in memory for a while so that moving
// between Now, Tonight and a picked time costs nothing more. Never written to
// storage: Google's terms keep hours out of anything that outlives the visit.
const HOLD_MS = 30 * 60_000;
// The route answers for at most this many places at once.
export const PLACE_HOURS_BATCH_SIZE = 40;

const held = new Map();

export function clearPlaceHoursCache() {
  held.clear();
}

function readHeld(bowlId, placeId, now) {
  const entry = held.get(`${bowlId}:${placeId}`);
  return entry && now - entry.at < HOLD_MS ? entry : null;
}

const EMPTY = Object.freeze({});

export default function usePlaceHours({ bowlId, slips, enabled, getPlaceHours = defaultGetPlaceHours }) {
  const placeIdsKey = useMemo(
    () => [...new Set((Array.isArray(slips) ? slips : []).map((slip) => slip?.place_id).filter(Boolean))].sort().join("\n"),
    [slips]
  );
  const requestKey = enabled && bowlId && placeIdsKey ? `${bowlId}\n${placeIdsKey}` : null;
  const [answer, setAnswer] = useState({ key: null, hours: EMPTY });
  const pending = useRef({ key: null, promise: null });

  useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();
    const placeIds = placeIdsKey.split("\n");
    const collect = () => Object.fromEntries(
      placeIds
        .map((placeId) => [placeId, readHeld(bowlId, placeId, Date.now())])
        .filter(([, entry]) => entry)
        .map(([placeId, entry]) => [placeId, entry.hours])
    );
    const missing = placeIds.filter((placeId) => !readHeld(bowlId, placeId, Date.now()));

    const promise = (async () => {
      for (let start = 0; start < missing.length; start += PLACE_HOURS_BATCH_SIZE) {
        const result = await getPlaceHours({
          placeIds: missing.slice(start, start + PLACE_HOURS_BATCH_SIZE),
          bowlId,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return EMPTY;
        Object.entries(result?.hours || {}).forEach(([placeId, hours]) => {
          held.set(`${bowlId}:${placeId}`, { at: Date.now(), hours: hours || null });
        });
      }
      const hours = collect();
      if (!controller.signal.aborted) setAnswer({ key: requestKey, hours });
      return hours;
    })();
    pending.current = { key: requestKey, promise };

    return () => controller.abort();
  }, [requestKey, bowlId, placeIdsKey, getPlaceHours]);

  const isReady = requestKey !== null && answer.key === requestKey;
  const hoursByPlaceId = isReady ? answer.hours : EMPTY;
  // A draw started while the hours are on their way waits for them rather
  // than drawing from a pool the filter has not reached yet.
  const settle = useCallback(
    () => (requestKey && pending.current.key === requestKey ? pending.current.promise : Promise.resolve(EMPTY)),
    [requestKey]
  );

  return {
    status: requestKey === null ? "idle" : isReady ? "ready" : "loading",
    hoursByPlaceId,
    settle,
  };
}

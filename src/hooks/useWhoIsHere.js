import { useCallback, useEffect, useState } from "react";
import {
  readAwayKeys,
  readSkipAsk,
  writeAwayKeys,
  writeSkipAsk,
} from "../utils/whoIsHere";

function readRoom(scope, userId, bowlId) {
  return { scope, away: readAwayKeys(userId, bowlId), skipAsk: readSkipAsk(userId, bowlId) };
}

/**
 * Tonight's room for one bowl on this device: who is away, and whether the
 * draw asks before it draws. Absences expire on their own (see
 * utils/whoIsHere.js), so the room is read again whenever the page comes back
 * into view -- a tab left open since last Friday must not keep last Friday's
 * empty chair.
 */
export default function useWhoIsHere({ bowlId, userId }) {
  const scope = `${userId || ""}|${bowlId || ""}`;
  const [state, setState] = useState(() => readRoom(scope, userId, bowlId));
  // A bowl switch or the account arriving reads that bowl's own room.
  let current = state;
  if (state.scope !== scope) {
    current = readRoom(scope, userId, bowlId);
    setState(current);
  }

  useEffect(() => {
    const reread = () => {
      if (document.visibilityState === "hidden") return;
      setState(readRoom(scope, userId, bowlId));
    };
    document.addEventListener("visibilitychange", reread);
    return () => document.removeEventListener("visibilitychange", reread);
  }, [scope, userId, bowlId]);

  const toggleAway = useCallback((key) => {
    setState((prev) => {
      // Starts from what is still in force, so an absence that has expired
      // meanwhile is not carried into tonight with a fresh date.
      const live = readAwayKeys(userId, bowlId);
      const away = live.includes(key)
        ? live.filter((entry) => entry !== key)
        : [...live, key];
      writeAwayKeys(userId, bowlId, away);
      return { ...prev, away };
    });
  }, [userId, bowlId]);

  const setSkipAsk = useCallback((skipAsk) => {
    writeSkipAsk(userId, bowlId, skipAsk);
    setState((prev) => ({ ...prev, skipAsk: Boolean(skipAsk) }));
  }, [userId, bowlId]);

  return { awayKeys: current.away, toggleAway, skipAsk: current.skipAsk, setSkipAsk };
}

import { useCallback, useMemo, useState } from "react";
import {
  readAwayKeys,
  readSkipAsk,
  writeAwayKeys,
  writeSkipAsk,
} from "../utils/whoIsHere";

/**
 * Tonight's room for one bowl on this device: who is away, and whether the
 * draw asks before it draws. `memberKeys` (once the roster is known) trims
 * anyone who has since left the bowl, so they never count against the ratio.
 */
export default function useWhoIsHere({ bowlId, userId, memberKeys = null }) {
  const scope = `${userId || ""}|${bowlId || ""}`;
  const [state, setState] = useState(() => ({
    scope,
    away: readAwayKeys(userId, bowlId),
    skipAsk: readSkipAsk(userId, bowlId),
  }));
  // A bowl switch or the account arriving reads that bowl's own room.
  let current = state;
  if (state.scope !== scope) {
    current = { scope, away: readAwayKeys(userId, bowlId), skipAsk: readSkipAsk(userId, bowlId) };
    setState(current);
  }

  const awayKeys = useMemo(() => {
    if (!memberKeys) return current.away;
    const members = new Set(memberKeys);
    return current.away.filter((key) => members.has(key));
  }, [current.away, memberKeys]);

  const toggleAway = useCallback((key) => {
    setState((prev) => {
      const away = prev.away.includes(key)
        ? prev.away.filter((entry) => entry !== key)
        : [...prev.away, key];
      writeAwayKeys(userId, bowlId, away);
      return { ...prev, away };
    });
  }, [userId, bowlId]);

  const setSkipAsk = useCallback((skipAsk) => {
    writeSkipAsk(userId, bowlId, skipAsk);
    setState((prev) => ({ ...prev, skipAsk: Boolean(skipAsk) }));
  }, [userId, bowlId]);

  return { awayKeys, toggleAway, skipAsk: current.skipAsk, setSkipAsk };
}

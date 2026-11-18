import { useCallback, useEffect, useRef, useState } from "react";
import {
  liveAwayKeys,
  readRoomRecord,
  writeAwayKeys,
  writeSkipAsk,
} from "../utils/whoIsHere";

function readRoom(scope, userId, bowlId) {
  const { saved, away, awayAt, skipAsk } = readRoomRecord(userId, bowlId);
  return { scope, saved, away, awayAt, skipAsk };
}

/**
 * Tonight's room for one bowl on this device: who is away, and whether the
 * draw asks before it draws. The room lives here, in memory; storage only
 * remembers it across visits, so a browser that refuses to store still draws
 * from exactly the people the sheet shows. Absences expire on their own (see
 * utils/whoIsHere.js), checked against the clock whenever they are read, and
 * another tab's newer choice is picked up when the page comes back into view.
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
  // Toggles and the draw read the latest room without waiting for a render,
  // and the state updaters stay free of storage writes (StrictMode runs them
  // twice).
  const roomRef = useRef(current);
  useEffect(() => {
    roomRef.current = current;
  }, [current]);

  useEffect(() => {
    const reread = () => {
      if (document.visibilityState === "hidden") return;
      const stored = readRoom(scope, userId, bowlId);
      // Nothing readable keeps what this visit chose; otherwise the newer
      // absence record wins, so another tab's change arrives and a stale
      // copy cannot undo this one's.
      if (!stored.saved) return;
      const mine = roomRef.current;
      const next = mine.scope === scope && mine.awayAt > stored.awayAt
        ? { ...stored, away: mine.away, awayAt: mine.awayAt }
        : stored;
      roomRef.current = next;
      setState(next);
    };
    document.addEventListener("visibilitychange", reread);
    return () => document.removeEventListener("visibilitychange", reread);
  }, [scope, userId, bowlId]);

  const toggleAway = useCallback((key) => {
    const now = Date.now();
    // Starts from what is still in force, so an absence that has expired
    // meanwhile is not carried into tonight with a fresh date.
    const live = liveAwayKeys(roomRef.current, now);
    const away = live.includes(key) ? live.filter((entry) => entry !== key) : [...live, key];
    writeAwayKeys(userId, bowlId, away, now);
    const next = { ...roomRef.current, away, awayAt: now };
    roomRef.current = next;
    setState(next);
  }, [userId, bowlId]);

  const setSkipAsk = useCallback((skipAsk) => {
    writeSkipAsk(userId, bowlId, skipAsk);
    const next = { ...roomRef.current, skipAsk: Boolean(skipAsk) };
    roomRef.current = next;
    setState(next);
  }, [userId, bowlId]);

  // The absences in force right now, for the moment of a draw: a page left
  // open all week must not carry one past its evening.
  const getLiveAwayKeys = useCallback(() => liveAwayKeys(roomRef.current), []);

  return { awayKeys: liveAwayKeys(current), getLiveAwayKeys, toggleAway, skipAsk: current.skipAsk, setSkipAsk };
}

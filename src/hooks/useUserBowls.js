import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { subscribeBowlChanges } from "../lib/bowlChanges";
import { orderBowlChoices } from "../utils/bowlOrdering";

const UserBowlsContext = createContext(null);
const LOAD_ERROR = "Could not load your bowls. Please try again.";

function normalizeContext(data, userId) {
  if (!data || !Array.isArray(data.bowls)) throw new Error("Invalid bowl context");
  const bowls = orderBowlChoices(data.bowls.map((row) => ({
    id: row.id, name: row.name, ownerId: row.owner_id,
    remainingCount: Number(row.remaining_count || 0),
    memberCount: Number(row.member_count || 0),
    role: row.owner_id === userId ? "Owner" : "Member",
    lastActivityAt: row.last_activity_at || null,
  })));
  const defaultBowlId = data.default_bowl_id || null;
  if ((bowls.length > 0 && !bowls.some((bowl) => bowl.id === defaultBowlId))
    || (bowls.length === 0 && defaultBowlId)) throw new Error("Inconsistent bowl context");
  return { bowls, defaultBowlId };
}

export function UserBowlsProvider({ children, userId, enabled = true }) {
  const [state, setState] = useState({ bowls: [], defaultBowlId: null, loading: true, error: null });
  const [savingDefault, setSavingDefault] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(null);
  const saveInFlight = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const refresh = useCallback(({ force = false } = {}) => {
    if (!userId || !enabled) return Promise.resolve(null);
    if (saveInFlight.current) return saveInFlight.current;
    if (inFlight.current && !force) return inFlight.current;
    const request = ++generation.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const promise = Promise.resolve().then(async () => {
      try {
        let response = await supabase.rpc("get_my_bowl_context");
        if (["40P01", "40001"].includes(response.error?.code)) {
          response = await supabase.rpc("get_my_bowl_context");
        }
        if (response.error) throw response.error;
        const context = normalizeContext(response.data, userId);
        if (!mounted.current || request !== generation.current) return null;
        setState({ ...context, loading: false, error: null });
        return context;
      } catch (error) {
        if (mounted.current && request === generation.current) {
          console.error("[useUserBowls] Failed to load bowls", error);
          setState((previous) => ({ ...previous, loading: false, error: LOAD_ERROR }));
        }
        return null;
      } finally {
        if (inFlight.current === promise) inFlight.current = null;
      }
    });
    inFlight.current = promise;
    return promise;
  }, [userId, enabled]);

  const setDefaultBowl = useCallback((bowlId) => {
    if (saveInFlight.current) return saveInFlight.current;
    const request = ++generation.current;
    inFlight.current = null;
    setSavingDefault(true);
    const promise = Promise.resolve().then(async () => {
      try {
        const { data, error } = await supabase.rpc("set_my_default_bowl", { p_bowl_id: bowlId });
        if (error) throw error;
        const context = normalizeContext(data, userId);
        if (!mounted.current || request !== generation.current) return null;
        setState({ ...context, loading: false, error: null });
        return context;
      } catch (error) {
        console.error("[useUserBowls] Failed to change default", error);
        if (mounted.current && request === generation.current) {
          setState((previous) => ({ ...previous, loading: false }));
        }
        return null;
      } finally {
        if (mounted.current) setSavingDefault(false);
        if (saveInFlight.current === promise) saveInFlight.current = null;
      }
    });
    saveInFlight.current = promise;
    return promise;
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    void refresh();
    const foreground = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    const unsubscribe = subscribeBowlChanges((change) => {
      if (change.type === "add" && change.phase !== "success") return;
      if (!change.userId || change.userId === userId) void refresh({ force: true });
    });
    return () => {
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
      unsubscribe();
      generation.current += 1;
      inFlight.current = null;
    };
  }, [enabled, userId, refresh]);

  const value = useMemo(() => ({ ...state, userId, refresh, setDefaultBowl, savingDefault }),
    [state, userId, refresh, setDefaultBowl, savingDefault]);
  return createElement(UserBowlsContext.Provider, { value }, children);
}

export default function useUserBowls() {
  const context = useContext(UserBowlsContext);
  if (!context) throw new Error("useUserBowls must be used within UserBowlsProvider");
  return context;
}

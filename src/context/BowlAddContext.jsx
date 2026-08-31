import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useUserBowls from "../hooks/useUserBowls";
import { bowlMovieService, addResult } from "../lib/addBowlMovie";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { notifyBowlChange } from "../lib/bowlChanges";
import { describeNetworkError } from "../utils/networkErrors";

const BowlAddContext = createContext(null);
const initial = { open: false, id: 0, initializing: false, initializationError: null, destination: null, pending: false, result: null, operation: null };

export function BowlAddProvider({ children }) {
  const { userId, refresh, bowls, loading, error } = useUserBowls();
  const [session, setSession] = useState(initial);
  const latest = useRef(initial);
  const mounted = useRef(true);
  const opening = useRef(0);
  const [invoker, setInvoker] = useState(null);
  const update = useCallback((patch) => {
    if (Object.entries(patch).every(([key, value]) => latest.current[key] === value)) return;
    latest.current = { ...latest.current, ...patch };
    if (mounted.current) setSession(latest.current);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; opening.current += 1; };
  }, []);

  const open = useCallback(async (bowlId = null) => {
    // The fixed header must not open a competing dialog during a draw/reveal.
    if (!latest.current.open && document.querySelector('[aria-modal="true"], [data-blocks-global-add]')) return;
    setInvoker(document.activeElement);
    if (latest.current.pending || latest.current.result?.code === "outcome_unknown") {
      update({ open: true });
      return;
    }
    const request = ++opening.current;
    update({ ...initial, open: true, id: latest.current.id + 1, initializing: true });
    const context = await refresh();
    if (!mounted.current || opening.current !== request || !latest.current.open) return;
    if (!context) {
      update({ initializing: false, initializationError: "Could not load your bowls. Please try again." });
      return;
    }
    const destination = context?.bowls.find((bowl) => bowl.id === (bowlId || context.defaultBowlId));
    update({ initializing: false, destination: destination || (bowlId ? { id: bowlId, name: "this bowl" } : null) });
  }, [refresh, update]);

  const getInvoker = useCallback(() => invoker, [invoker]);

  const close = useCallback(() => {
    opening.current += 1;
    update({ open: false });
  }, [update]);

  const setDestination = useCallback((bowl) => {
    if (latest.current.pending || latest.current.result?.code === "outcome_unknown") return;
    update({ destination: bowl, result: null, operation: null });
  }, [update]);

  const finish = useCallback((operation, result) => {
    if (!mounted.current) return;
    update({ pending: false, operation, result });
    if (result.ok || result.code === "access_lost") void refresh({ force: true });
  }, [refresh, update]);

  const submit = useCallback(async (draft) => {
    const currentSession = latest.current;
    if (currentSession.pending) return addResult(false, "pending", "This movie is still being added.");
    if (currentSession.result?.code === "outcome_unknown") return currentSession.result;
    if (!currentSession.destination || !bowls.some((bowl) => bowl.id === currentSession.destination.id)) {
      return addResult(false, "access_lost", "You no longer have access to this bowl. Choose another bowl.");
    }
    // Capture before even the metadata request; closing or switching routes
    // cannot retarget this operation or cause a second insert.
    const operation = {
      accountId: userId, bowlId: currentSession.destination.id,
      bowlName: currentSession.destination.name, movie: { ...draft },
      submissionId: crypto.randomUUID(), isCurrent: () => mounted.current,
    };
    update({ pending: true, result: null, operation });
    let result;
    try {
      if (!draft.isCustomEntry && !draft.detailsLoaded) {
        const details = await getTmdbMovieDetails(draft.tmdb_id || draft.id);
        const providers = await fetchStreamingProviders(draft.tmdb_id || draft.id, { region: "US" });
        operation.movie = { ...draft, ...details, note: draft.note,
          streamingProviders: providers.providers || [] };
      }
      result = mounted.current ? await bowlMovieService.add(operation)
        : addResult(false, "not_authenticated", "You must be signed in to add a movie.");
    } catch (error) {
      result = addResult(false, "metadata_failed", describeNetworkError(error, "Failed to load movie details. Please try again."));
    }
    finish(operation, result);
    return result;
  }, [bowls, userId, update, finish]);

  const checkStatus = useCallback(async () => {
    const operation = latest.current.operation;
    if (!operation || latest.current.pending) return null;
    update({ pending: true });
    const result = await bowlMovieService.checkStatus(operation);
    if (result.ok && mounted.current) notifyBowlChange({ type: "add", phase: "success", userId,
      bowlId: operation.bowlId, submissionId: operation.submissionId, movie: result.movie });
    finish(operation, result);
    return result;
  }, [update, finish, userId]);

  const value = useMemo(() => ({ ...session, bowlsLoading: loading, bowlsError: error || session.initializationError,
    openGlobalAdd: () => open(), openBowlAdd: open, close, setDestination, submit, checkStatus,
    getInvoker, clearFeedback: () => {
      if (latest.current.result?.code !== "outcome_unknown") update({ result: null });
    },
  }), [session, loading, error, open, close, setDestination, submit, checkStatus, update, getInvoker]);
  return <BowlAddContext.Provider value={value}>{children}</BowlAddContext.Provider>;
}

export default function useBowlAdd() {
  return useContext(BowlAddContext);
}

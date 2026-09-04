import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import useUserBowls from "../hooks/useUserBowls";
import { bowlMovieService, addResult, getSubmissionKey, isUnsettledAddCode } from "../lib/addBowlMovie";
import { bowlMovieActions } from "../lib/bowlMovieActions";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { notifyBowlChange } from "../lib/bowlChanges";
import { describeNetworkError } from "../utils/networkErrors";

const BowlAddContext = createContext(null);
const initial = { open: false, id: 0, initializing: false, initializationError: null, destination: null, pending: false, result: null, operation: null, unresolved: [], additions: [], actionAnnouncement: "" };

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
    if (latest.current.pending || latest.current.additions.some((entry) => entry.pending)) {
      update({ open: true });
      return;
    }
    const request = ++opening.current;
    // An unconfirmed add outlives the session that made it: it is the only
    // thing that can still turn into a real movie, or prove it never did.
    update({ ...initial, unresolved: latest.current.unresolved, open: true, id: latest.current.id + 1, initializing: true });
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
    if (latest.current.pending) return;
    update({ destination: bowl, result: null, operation: null });
  }, [update]);

  const finish = useCallback((operation, result) => {
    if (!mounted.current) return;
    const additions = result.ok && result.movie?.id
      ? [{ movie: { ...operation.movie, ...result.movie }, bowlId: operation.bowlId, bowlName: operation.bowlName,
        pending: null, error: null }, ...latest.current.additions.filter((entry) => entry.movie.id !== result.movie.id)]
      : latest.current.additions;
    const others = latest.current.unresolved.filter((entry) => entry.operation.submissionId !== operation.submissionId);
    const claim = latest.current.unresolved.find((entry) => entry.operation.submissionId === operation.submissionId);
    // Only a landed row releases a claim. A retry that fails before dispatch —
    // offline, a dropped request — says nothing about whether the first write
    // is still on its way, so the claim stands and keeps its own message. A new
    // submission has a fresh id and no claim, so this cannot hold it back.
    const unresolved = isUnsettledAddCode(result.code) ? [...others, { operation, result }]
      : result.ok || !claim ? others : [...others, claim];
    update({ pending: false, operation, result, unresolved, additions });
    if (result.ok || result.code === "access_lost") void refresh({ force: true });
  }, [refresh, update]);

  const submit = useCallback(async (draft) => {
    const currentSession = latest.current;
    if (currentSession.pending) return addResult(false, "pending", "This movie is still being added.");
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
    // Only a second attempt at the same title in the same bowl could double it.
    // Everything else stays available while that one submission is unresolved.
    const key = getSubmissionKey(operation);
    const blocking = currentSession.unresolved.find((entry) => getSubmissionKey(entry.operation) === key);
    if (blocking) {
      const result = addResult(false, "awaiting_confirmation",
        `${operation.movie.title} already has an unfinished add to ${operation.bowlName}. Finish that one before adding it again.`);
      update({ result, operation });
      return result;
    }
    update({ pending: true, result: null, operation });
    let result;
    try {
      if (!draft.isCustomEntry && !draft.detailsLoaded) {
        const details = await getTmdbMovieDetails(draft.tmdb_id || draft.id);
        const providers = await fetchStreamingProviders(draft.tmdb_id || draft.id, { region: "US" });
        operation.movie = { ...draft, ...details, note: draft.note,
          streamingProviders: providers.providers || [],
          streamingProviderLogos: providers.providerLogos || {} };
      }
      result = mounted.current ? await bowlMovieService.add(operation)
        : addResult(false, "not_authenticated", "You must be signed in to add a movie.");
    } catch (error) {
      result = addResult(false, "metadata_failed", describeNetworkError(error, "Failed to load movie details. Please try again."));
    }
    finish(operation, result);
    return result;
  }, [bowls, userId, update, finish]);

  const claimed = useCallback((submissionId) => (submissionId
    ? latest.current.unresolved.find((item) => item.operation.submissionId === submissionId)
    : latest.current.unresolved[0])?.operation || null, []);

  // Resends the claimed operation under its original id, so a first write that
  // arrives late loses the primary key instead of adding a second slip.
  const retryAdd = useCallback(async (submissionId = null) => {
    const operation = claimed(submissionId);
    if (!operation || latest.current.pending) return null;
    update({ pending: true, result: null });
    const result = mounted.current ? await bowlMovieService.add(operation)
      : addResult(false, "not_authenticated", "You must be signed in to add a movie.");
    finish(operation, result);
    return result;
  }, [claimed, update, finish]);

  const checkStatus = useCallback(async (submissionId = null) => {
    const operation = claimed(submissionId);
    if (!operation || latest.current.pending) return null;
    update({ pending: true });
    const result = await bowlMovieService.checkStatus(operation);
    if (result.ok && mounted.current) notifyBowlChange({ type: "add", phase: "success", userId,
      bowlId: operation.bowlId, submissionId: operation.submissionId, movie: result.movie });
    finish(operation, result);
    return result;
  }, [claimed, update, finish, userId]);

  const changeAddedMovie = useCallback(async (movieId, action, note) => {
    const entry = latest.current.additions.find((item) => item.movie.id === movieId);
    if (!entry || entry.pending) return addResult(false, "pending", "This movie is still being updated.");
    if (!bowls.some((bowl) => bowl.id === entry.bowlId)) {
      return addResult(false, "access_lost", "You no longer have access to this bowl.");
    }
    const sessionId = latest.current.id;
    const current = () => mounted.current && latest.current.id === sessionId;
    const patchEntry = (patch) => update({ additions: latest.current.additions.map((item) =>
      item.movie.id === movieId ? { ...item, ...patch } : item) });
    patchEntry({ pending: action, error: null });
    const result = await bowlMovieActions[action === "comment" ? "updateNote" : "remove"]({
      accountId: userId, bowlId: entry.bowlId, movieId, note, isCurrent: current,
    });
    if (!current()) return result;
    if (result.ok && action === "remove") {
      update({ additions: latest.current.additions.filter((item) => item.movie.id !== movieId),
        actionAnnouncement: `Removed ${entry.movie.title} from ${entry.bowlName}`,
        ...(latest.current.operation?.submissionId === movieId ? { result: null } : {}) });
    } else {
      patchEntry({ pending: null, error: result.ok ? null : result,
        ...(result.ok ? { movie: { ...entry.movie, ...result.movie } } : {}) });
      if (result.ok) update({ actionAnnouncement: `Comment saved for ${entry.movie.title}` });
    }
    return result;
  }, [bowls, userId, update]);

  const value = useMemo(() => ({ ...session, bowlsLoading: loading, bowlsError: error || session.initializationError,
    actionsPending: session.additions.some((entry) => entry.pending),
    updateAddedMovieNote: (id, note) => changeAddedMovie(id, "comment", note),
    removeAddedMovie: (id) => changeAddedMovie(id, "remove"),
    openGlobalAdd: () => open(), openBowlAdd: open, close, setDestination, submit, checkStatus, retryAdd,
    getInvoker, clearFeedback: () => update({ result: null }),
  }), [session, loading, error, open, close, setDestination, submit, checkStatus, retryAdd, update, getInvoker, changeAddedMovie]);
  return <BowlAddContext.Provider value={value}>{children}</BowlAddContext.Provider>;
}

export default function useBowlAdd() {
  return useContext(BowlAddContext);
}

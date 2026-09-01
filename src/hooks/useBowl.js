import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { bowlMovieActions } from "../lib/bowlMovieActions";
import { bowlMovieService, addResult, getPositiveTmdbId, isDuplicateMovieError, getDuplicateMovieMessage } from "../lib/addBowlMovie";
import { subscribeBowlChanges, notifyBowlChange } from "../lib/bowlChanges";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { getDrawSelection, getResolvedDrawPool } from "../utils/drawSelection";
import { DEFAULT_DRAW_METHOD, getDrawMethod } from "../utils/drawMethods";
import {
  getMovieFromDrawCandidate,
  hydrateDrawCandidate,
} from "../utils/selectDrawCandidate";
import {
  OFFLINE_MESSAGE,
  describeNetworkError,
  isOffline,
  isOfflineError,
} from "../utils/networkErrors";
import { getBrowserTimeZone } from "../utils/getBrowserTimeZone";
import { belongsInBowlWatchHistory } from "../utils/watchHistory";
import useBowlFilterMetadata from "./useBowlFilterMetadata";

function sortByAddedAtAscending(movies = []) {
  return [...movies].sort((a, b) => {
    const aTime = new Date(a?.added_at || 0).getTime();
    const bTime = new Date(b?.added_at || 0).getTime();
    return aTime - bTime;
  });
}

function getDrawFailureMessage(error) {
  // Check this first: none of the codes below can be trusted when the request
  // never reached the database.
  if (isOfflineError(error)) return OFFLINE_MESSAGE;

  const errorCode = String(error?.code || "");
  const errorMessageText = String(error?.message || "").toLowerCase();

  if (errorCode === "42501" || errorMessageText.includes("permission denied")) {
    return "You don't have permission to draw in this bowl.";
  }
  if (
    errorCode === "PGRST202" ||
    (errorMessageText.includes("draw_bowl_movie_by_rotation") &&
      (errorMessageText.includes("could not find") || errorMessageText.includes("does not exist")))
  ) {
    return "Rotation requires the latest database migration. Please run it and try again.";
  }
  if (errorMessageText.includes("now uses rotation")) {
    return "This bowl now uses rotation. Refresh Movie Bowl and try again.";
  }
  if (errorMessageText.includes("stale")) {
    return "The eligible movie pool changed. Please try again.";
  }
  if (errorMessageText.includes("no longer available")) {
    return "That movie is no longer available to draw.";
  }
  return "Could not draw a movie. Please try again.";
}

function getPinUpdateFailureMessage(error) {
  if (isOfflineError(error)) return OFFLINE_MESSAGE;

  const errorCode = String(error?.code || "");
  const errorMessageText = String(error?.message || "").toLowerCase();

  if (
    errorCode === "PGRST202" ||
    (errorMessageText.includes("set_own_bowl_movie_pin") &&
      (errorMessageText.includes("could not find") || errorMessageText.includes("does not exist")))
  ) {
    return "Pinning requires the latest database migration. Please run it and try again.";
  }
  if (errorCode === "42501" || errorMessageText.includes("permission denied")) {
    return "You don't have permission to pin this movie.";
  }
  if (errorMessageText.includes("no longer available")) {
    return "This movie is no longer available to pin.";
  }
  return "Could not pin this movie. Please try again.";
}

function createProfileEmailByUserId(profileRows = []) {
  return new Map(
    profileRows
      .filter((profile) => profile?.user_id && profile?.email)
      .map((profile) => [profile.user_id, profile.email])
  );
}

function attachContributorProfile(row, profileEmailByUserId) {
  const email = profileEmailByUserId.get(row?.added_by);
  return email
    ? {
      ...row,
      profiles: { email },
    }
    : row;
}

// useBowl is the core state engine for a bowl.
// It manages bowl state and defines how that state transitions (add + draw).

export default function useBowl(
  bowlId,
  { drawMethod = DEFAULT_DRAW_METHOD, includeReturnedHistory = false } = {}
) {
  // Primary bowl state:
  // - remaining: movies not yet drawn (drawn_at is null)
  // - watched: bowl draw events that have not been returned to the bowl
  // - watchHistory: active draws plus older returns that preserved personal history
  const [bowl, setBowl] = useState({
    remaining: [],
    watched: [],
    watchHistory: [],
  });
  const filterMetadataFetchers = useBowlFilterMetadata(bowlId, bowl.remaining);

  // Simple loading/error flags for DB-backed state.
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const loadedUserId = useRef(null);
  const loadSequence = useRef(0);
  const movieRevision = useRef(0);
  const recentMovieChanges = useRef(new Map());
  // Set when a load fails for connectivity reasons, so reconnecting can retry it.
  const failedWhileOfflineRef = useRef(false);

  const loadBowlMovies = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const revisionAtStart = movieRevision.current;
    if (!bowlId) {
      setBowl({ remaining: [], watched: [], watchHistory: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    failedWhileOfflineRef.current = false;

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;
      if (sequence !== loadSequence.current) return;

      if (authError || !user) {
        setBowl({ remaining: [], watched: [], watchHistory: [] });
        return;
      }

      loadedUserId.current = user.id;

      // Remaining movies
      const { data: remaining, error: remainingError } = await supabase
        .from("bowl_movies")
        .select(
          "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, is_pinned, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at"
        )
        .eq("bowl_id", bowlId)
        .is("drawn_at", null)
        .order("added_at", { ascending: true });

      if (remainingError) {
        console.error("[useBowl] Failed to load remaining movies", remainingError);
        failedWhileOfflineRef.current ||= isOfflineError(remainingError);
        setErrorMessage(
          describeNetworkError(remainingError, "Failed to load remaining movies.")
        );
      }

      // Draw events are separate from current bowl slips so a return to the
      // bowl never erases the fact that the bowl made a draw.
      let drawEventsQuery = supabase
        .from("bowl_draw_events")
        .select(
          "id, bowl_id, source_bowl_movie_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, added_by, added_by_name, drawn_at, drawn_by, snapshot_at, returned_at, returned_by"
        )
        .eq("bowl_id", bowlId);

      if (!includeReturnedHistory) {
        drawEventsQuery = drawEventsQuery.is("returned_at", null);
      }

      const { data: drawEvents, error: watchedError } = await drawEventsQuery.order(
        "drawn_at",
        { ascending: false }
      );

      if (watchedError) {
        console.error("[useBowl] Failed to load watched movies", watchedError);
        failedWhileOfflineRef.current ||= isOfflineError(watchedError);
        setErrorMessage(
          describeNetworkError(watchedError, "Failed to load watched movies.")
        );
      }

      const { data: profileRows, error: profilesError } = await supabase.rpc(
        "get_bowl_profile_directory",
        { p_bowl_id: bowlId }
      );

      if (profilesError) {
        console.error("[useBowl] Failed to load contributor profiles", profilesError);
      }

      const profileEmailByUserId = createProfileEmailByUserId(profileRows || []);
      if (sequence !== loadSequence.current) return;
      // A read begun before a mutation committed may contain an older snapshot.
      // Preserve confirmed adds, edits, and removals until a subsequent fresh read.
      const changesDuringRead = [];
      for (const [id, addition] of recentMovieChanges.current) {
        if (addition.bowlId === bowlId && addition.revision > revisionAtStart) {
          changesDuringRead.push({ id, movie: addition.movie });
        } else {
          recentMovieChanges.current.delete(id);
        }
      }

      setBowl((prev) => {
        const pendingRemaining = (prev.remaining || []).filter(
          (movie) => movie?.local_status === "syncing"
        );
        let nextRemaining = (remaining || []).map((movie) =>
          attachContributorProfile(movie, profileEmailByUserId)
        );
        for (const { id, movie } of changesDuringRead) {
          nextRemaining = nextRemaining.filter((row) => row.id !== id);
          if (movie && !movie.drawn_at) {
            nextRemaining.push(attachContributorProfile(movie, profileEmailByUserId));
          }
        }

        const mergedPending = pendingRemaining.filter((pendingMovie) => {
          const pendingSnapshot = String(pendingMovie?.snapshot_at || "");
          const pendingAddedBy = String(pendingMovie?.added_by || "");
          return !nextRemaining.some((row) => {
            const rowSnapshot = String(row?.snapshot_at || "");
            const rowAddedBy = String(row?.added_by || "");
            return row.id === pendingMovie.id || (rowSnapshot && rowSnapshot === pendingSnapshot && rowAddedBy === pendingAddedBy);
          });
        });

        const mappedDrawEvents = (drawEvents || []).map((event) => {
          const eventWithProfile = attachContributorProfile(
            event,
            profileEmailByUserId
          );
          return {
            ...eventWithProfile,
            drawEventId: event.id,
            bowlMovieId: event.source_bowl_movie_id,
          };
        });
        const activeDrawEvents = mappedDrawEvents.filter(
          (event) => !event.returned_at
        );

        return {
          remaining: sortByAddedAtAscending([...nextRemaining, ...mergedPending]),
          watched: activeDrawEvents,
          watchHistory: mappedDrawEvents.filter(belongsInBowlWatchHistory),
        };
      });
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      console.error("[useBowl] Unexpected error loading bowl movies", err);
      failedWhileOfflineRef.current = isOfflineError(err);
      setErrorMessage(
        describeNetworkError(err, "Unexpected error loading bowl movies.")
      );
      setBowl({ remaining: [], watched: [], watchHistory: [] });
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [bowlId, includeReturnedHistory]);

  useEffect(() => {
    // Load DB-backed bowl movies whenever the bowl changes.
    loadBowlMovies();
    return () => { loadSequence.current += 1; };
  }, [loadBowlMovies]);

  useEffect(() => {
    // A bowl that failed to load while offline would otherwise sit empty until
    // the user thought to refresh. Retry on reconnect, but only when the last
    // attempt actually failed, so a flapping connection cannot spam the API.
    const handleOnline = () => {
      if (!failedWhileOfflineRef.current) return;
      failedWhileOfflineRef.current = false;
      loadBowlMovies();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [loadBowlMovies]);

  // Resolve the eligible pool, record the bowl draw and personal history
  // entries atomically, then reload the remaining/watched lists.
  const handleDraw = useCallback(async (options = {}) => {
    if (!bowlId) return null;
    const drawableRemaining = (bowl.remaining || []).filter(
      (movie) => movie?.local_status !== "syncing"
    );
    if (drawableRemaining.length === 0) return null;

    // A draw is server-authoritative, so a confirmed-offline device cannot
    // complete one. Say so up front rather than after a spinner and a timeout.
    if (isOffline()) {
      setErrorMessage(OFFLINE_MESSAGE);
      return null;
    }

    setErrorMessage(null);

    const activeDrawMethod = options.drawMethod ?? drawMethod;
    const method = getDrawMethod(activeDrawMethod);
    const watchedTimeZone = getBrowserTimeZone();
    const fetchProviders = filterMetadataFetchers.fetchProviders;
    const selectionOptions = {
      remainingMovies: drawableRemaining,
      prioritizeByServices: options.prioritizeByServices,
      prioritizeByServiceRank: options.prioritizeByServiceRank,
      userStreamingServices: options.userStreamingServices,
      ratingFilter: options.ratingFilter,
      genreFilter: options.genreFilter,
      runtimeFilter: options.runtimeFilter,
      fetchProviders,
      fetchMovieDetails: filterMetadataFetchers.fetchMovieDetails,
      fetchFilterMetadata: filterMetadataFetchers.fetchFilterMetadata,
    };

    let selected;
    try {
      if (method.selectionMode === "server_rotation") {
        const { candidates, errorMessage: drawError } = await getResolvedDrawPool(
          selectionOptions
        );
        if (drawError) {
          setErrorMessage(drawError);
          return null;
        }

        const candidateMovieIds = candidates
          .map((candidate) => getMovieFromDrawCandidate(candidate)?.id)
          .filter(Boolean);
        if (candidateMovieIds.length === 0) return null;

        const { data, error } = await supabase.rpc("draw_bowl_movie_by_rotation", {
          p_bowl_id: bowlId,
          p_candidate_movie_ids: candidateMovieIds,
          p_watched_timezone: watchedTimeZone,
        });
        if (error) {
          console.error("[useBowl] Failed to draw movie by rotation", error);
          setErrorMessage(getDrawFailureMessage(error));
          return null;
        }

        const rotationResult = Array.isArray(data) ? data[0] : data;
        const selectedMovieId = rotationResult?.bowl_movie_id;
        const selectedCandidate = candidates.find(
          (candidate) =>
            String(getMovieFromDrawCandidate(candidate)?.id || "") ===
            String(selectedMovieId || "")
        );
        if (!selectedCandidate) {
          console.error("[useBowl] Rotation returned a movie outside the resolved pool", {
            selectedMovieId,
          });
          setErrorMessage("The eligible movie pool changed. Please try again.");
          notifyBowlChange({ type: "context", bowlId });
          await loadBowlMovies();
          return null;
        }

        selected = await hydrateDrawCandidate(selectedCandidate, fetchProviders);
      } else {
        const { selected: clientSelected, errorMessage: drawError } =
          await getDrawSelection({
            ...selectionOptions,
            randomFn: options.randomFn,
            drawMethod: activeDrawMethod,
          });
        if (drawError) {
          setErrorMessage(drawError);
          return null;
        }
        if (!clientSelected) return null;

        const { error } = await supabase.rpc("draw_bowl_movie", {
          p_bowl_movie_id: clientSelected.movie.id,
          p_watched_timezone: watchedTimeZone,
        });
        if (error) {
          console.error("[useBowl] Failed to draw movie", error);
          setErrorMessage(getDrawFailureMessage(error));
          return null;
        }
        selected = clientSelected;
      }
    } catch (error) {
      console.error("[useBowl] Unexpected error drawing movie", error);
      setErrorMessage("Could not draw a movie. Please try again.");
      return null;
    }

    if (!selected) return null;
    const drawn = selected.movie;

    // Reload after updating.
    notifyBowlChange({ type: "context", bowlId });
    await loadBowlMovies();

    return {
      ...drawn,
      streamingProviders: selected.providers || [],
      streamingRegion: selected.region || "US",
      streamingFetchedAt: selected.fetchedAt || null,
    };
  }, [bowlId, bowl.remaining, loadBowlMovies, drawMethod, filterMetadataFetchers]);

  useEffect(() => subscribeBowlChanges((change) => {
    if (change.bowlId !== bowlId || change.userId !== loadedUserId.current) return;
    if (change.type === "movie") {
      const movie = change.action === "remove" ? null : change.movie;
      recentMovieChanges.current.set(change.movieId, { bowlId, movie, revision: ++movieRevision.current });
      setBowl((previous) => ({ ...previous, remaining: previous.remaining.flatMap((row) =>
        row.id !== change.movieId ? [row] : movie && !movie.drawn_at ? [{ ...row, ...movie }] : []) }));
      return;
    }
    if (change.type !== "add") return;
    if (change.phase === "success" && change.movie) {
      recentMovieChanges.current.set(change.movie.id, {
        bowlId, movie: change.movie, revision: ++movieRevision.current,
      });
    }
    setBowl((previous) => {
      const pending = previous.remaining.find((row) => row.id === change.submissionId);
      const remaining = previous.remaining.filter((row) => row.id !== change.submissionId);
      if (change.movie && change.phase !== "error" && !change.movie.drawn_at) {
        remaining.push({ ...pending, ...change.movie });
      }
      return { ...previous, remaining: sortByAddedAtAscending(remaining) };
    });
  }), [bowlId]);

  const handleAddMovie = useCallback(async (movie) => {
    let result;
    try {
      const { data } = await supabase.auth.getSession();
      result = await bowlMovieService.add({ movie, bowlId,
        accountId: data?.session?.user?.id, submissionId: crypto.randomUUID() });
    } catch (error) {
      result = addResult(false, "add_failed", describeNetworkError(error, "Could not add this movie. Please try again."));
    }
    setErrorMessage(result.ok ? null : result.message);
    return result;
  }, [bowlId]);

  const handleUpdateMovieNote = useCallback(async (movieId, note) => {
    const result = await bowlMovieActions.updateNote({
      accountId: loadedUserId.current, bowlId, movieId, note,
    });
    if (!result.ok) await loadBowlMovies();
    return result;
  }, [bowlId, loadBowlMovies]);

  const handleSetMoviePin = useCallback(
    async (movieId, pinned) => {
      if (!bowlId || !movieId) {
        return addResult(false, "invalid_movie", "Choose a movie to pin.");
      }
      if (isOffline()) {
        return addResult(false, "offline", OFFLINE_MESSAGE);
      }

      const targetMovie = (bowl.remaining || []).find(
        (movie) => String(movie?.id || "") === String(movieId)
      );
      if (!targetMovie || targetMovie.local_status === "syncing") {
        return addResult(
          false,
          "pin_update_failed",
          "This movie is no longer available to pin."
        );
      }

      const shouldPin = Boolean(pinned);
      const contributorId = targetMovie.added_by;
      setBowl((prev) => ({
        ...prev,
        remaining: (prev.remaining || []).map((movie) => {
          const isTarget = String(movie?.id || "") === String(movieId);
          if (!shouldPin) {
            return isTarget ? { ...movie, is_pinned: false } : movie;
          }
          if (movie?.added_by !== contributorId || movie.local_status === "syncing") {
            return movie;
          }
          return { ...movie, is_pinned: isTarget };
        }),
      }));

      try {
        const { data, error } = await supabase.rpc("set_own_bowl_movie_pin", {
          p_bowl_movie_id: movieId,
          p_pinned: shouldPin,
        });

        if (error) {
          console.error("[useBowl] Failed to update pinned movie", error);
          const message = getPinUpdateFailureMessage(error);
          notifyBowlChange({ type: "context", bowlId });
          await loadBowlMovies();
          return addResult(false, "pin_update_failed", message);
        }

        const updatedMovie = Array.isArray(data) ? data[0] : data;
        setBowl((prev) => ({
          ...prev,
          remaining: (prev.remaining || []).map((movie) =>
            String(movie?.id || "") === String(movieId)
              ? { ...movie, ...(updatedMovie || {}), is_pinned: shouldPin }
              : movie
          ),
        }));
        return {
          ...addResult(true),
          movie: updatedMovie || { id: movieId, is_pinned: shouldPin },
        };
      } catch (error) {
        console.error("[useBowl] Unexpected error updating pinned movie", error);
        notifyBowlChange({ type: "context", bowlId });
        await loadBowlMovies();
        return addResult(
          false,
          "pin_update_failed",
          getPinUpdateFailureMessage(error)
        );
      }
    },
    [bowlId, bowl.remaining, loadBowlMovies]
  );

  const handleDeleteMovie = useCallback(async (movieId) => {
    const result = await bowlMovieActions.remove({
      accountId: loadedUserId.current, bowlId, movieId,
    });
    await loadBowlMovies();
    if (!result.ok) setErrorMessage(result.message);
    return result.ok;
  }, [bowlId, loadBowlMovies]);

  const handleReaddMovie = useCallback(
    async (movieId) => {
      if (!bowlId || !movieId) {
        return addResult(false, "invalid_movie", "Choose a movie to re-add.");
      }
      if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
        return addResult(
          false,
          "limit_reached",
          `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`
        );
      }

      const targetMovie = (bowl.watched || []).find((movie) =>
        [movie?.drawEventId, movie?.id, movie?.bowlMovieId].some(
          (candidateId) => String(candidateId || "") === String(movieId)
        )
      );
      const targetDrawEventId = targetMovie?.drawEventId || targetMovie?.id || movieId;

      if (!targetMovie) {
        console.error("[useBowl] Invalid re-add draw event id", { movieId });
        return addResult(false, "invalid_movie", "Could not re-add this movie.");
      }
      const targetTmdbId = getPositiveTmdbId(targetMovie);
      const activeDuplicate = targetTmdbId == null
        ? null
        : (bowl.remaining || []).find(
            (movie) => getPositiveTmdbId(movie) === targetTmdbId
          );
      if (activeDuplicate) {
        return addResult(
          false,
          "duplicate_movie",
          getDuplicateMovieMessage(targetMovie, activeDuplicate)
        );
      }

      const { error } = await supabase.rpc("return_bowl_draw_to_bowl", {
        p_draw_event_id: targetDrawEventId,
      });

      if (error) {
        const duplicateMovie = isDuplicateMovieError(error);
        if (!duplicateMovie) {
          console.error("[useBowl] Failed to re-add watched movie", error);
        }
        return addResult(
          false,
          duplicateMovie ? "duplicate_movie" : "add_failed",
          duplicateMovie
            ? getDuplicateMovieMessage(targetMovie, activeDuplicate)
            : describeNetworkError(error, "Could not re-add this movie. Please try again.")
        );
      }

      notifyBowlChange({ type: "context", bowlId });
      await loadBowlMovies();
      return addResult(true);
    },
    // `loadBowlMovies` refreshes the watched collection after the mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bowlId, bowl.remaining, loadBowlMovies]
  );

  return {
    bowl,
    isLoading,
    errorMessage,
    reload: loadBowlMovies,
    handleDraw,
    handleAddMovie,
    handleUpdateMovieNote,
    handleSetMoviePin,
    handleDeleteMovie,
    handleReaddMovie,
    filterMetadataFetchers,
  };
}

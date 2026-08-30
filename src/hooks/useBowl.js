import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { warmTmdbMovieFilterMetadata } from "../lib/tmdbApi";
import { fetchProviderLinks } from "../lib/providerLinks";
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
import {
  getMovieNoteValidationError,
  normalizeMovieNote,
} from "../utils/movieNote";
import { getBrowserTimeZone } from "../utils/getBrowserTimeZone";
import { getMovieAttributionLabel } from "../utils/drawBuckets";
import useBowlFilterMetadata from "./useBowlFilterMetadata";

const DUPLICATE_MOVIE_MESSAGE = "This movie is already in the bowl.";

function getDuplicateMovieMessage(movie, existingMovie) {
  const title = String(movie?.title || "").trim();
  const contributorName = getMovieAttributionLabel(existingMovie);
  if (!title || !contributorName) return DUPLICATE_MOVIE_MESSAGE;

  return `"${title}" is already in the bowl — ${contributorName} added it, so it can come up on their turn.`;
}

function createSyntheticTmdbId() {
  // Keep this within signed 32-bit range to avoid common integer column overflows.
  const min = 1;
  const max = 2_000_000_000;
  return -Math.floor(Math.random() * (max - min + 1)) - min;
}

function sortByAddedAtAscending(movies = []) {
  return [...movies].sort((a, b) => {
    const aTime = new Date(a?.added_at || 0).getTime();
    const bTime = new Date(b?.added_at || 0).getTime();
    return aTime - bTime;
  });
}

function createLocalTempId() {
  return `temp:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}

function getPositiveTmdbId(movie) {
  const numericId = Number(movie?.tmdb_id ?? movie?.id);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

function isDuplicateMovieError(error) {
  const code = String(error?.code || "");
  const text = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return (
    code === "23505" &&
    (text.includes("already in the bowl") || text.includes("bowl_active_tmdb_movies"))
  );
}

function addResult(ok, code = null, message = null) {
  return { ok, code, message };
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

function getNoteUpdateFailureMessage(error) {
  if (isOfflineError(error)) return OFFLINE_MESSAGE;

  const errorCode = String(error?.code || "");
  const errorMessageText = String(error?.message || "").toLowerCase();

  if (errorMessageText.includes("500 characters or fewer")) {
    return "Comment must be 500 characters or fewer.";
  }
  if (errorCode === "42501" || errorMessageText.includes("permission denied")) {
    return "You don't have permission to edit this comment.";
  }
  if (errorMessageText.includes("no longer available")) {
    return "This comment is no longer available to edit. The movie may already have been drawn.";
  }
  return "Could not save this comment. Please try again.";
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

export default function useBowl(bowlId, { drawMethod = DEFAULT_DRAW_METHOD } = {}) {
  // Primary bowl state:
  // - remaining: movies not yet drawn (drawn_at is null)
  // - watched: bowl draw events that have not been returned to the bowl
  const [bowl, setBowl] = useState({
    remaining: [],
    watched: [],
  });
  const filterMetadataFetchers = useBowlFilterMetadata(bowlId, bowl.remaining);

  // Simple loading/error flags for DB-backed state.
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const addRequestsInFlightRef = useRef(new Set());
  // Set when a load fails for connectivity reasons, so reconnecting can retry it.
  const failedWhileOfflineRef = useRef(false);

  const loadBowlMovies = useCallback(async () => {
    if (!bowlId) {
      setBowl({ remaining: [], watched: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    failedWhileOfflineRef.current = false;

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        setBowl({ remaining: [], watched: [] });
        return;
      }

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
      const { data: watchedEvents, error: watchedError } = await supabase
        .from("bowl_draw_events")
        .select(
          "id, bowl_id, source_bowl_movie_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, added_by, added_by_name, drawn_at, drawn_by, snapshot_at"
        )
        .eq("bowl_id", bowlId)
        .is("returned_at", null)
        .order("drawn_at", { ascending: false });

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

      setBowl((prev) => {
        const pendingRemaining = (prev.remaining || []).filter(
          (movie) => movie?.local_status === "syncing"
        );
        const nextRemaining = (remaining || []).map((movie) =>
          attachContributorProfile(movie, profileEmailByUserId)
        );

        const mergedPending = pendingRemaining.filter((pendingMovie) => {
          const pendingSnapshot = String(pendingMovie?.snapshot_at || "");
          const pendingAddedBy = String(pendingMovie?.added_by || "");
          return !nextRemaining.some((row) => {
            const rowSnapshot = String(row?.snapshot_at || "");
            const rowAddedBy = String(row?.added_by || "");
            return rowSnapshot && rowSnapshot === pendingSnapshot && rowAddedBy === pendingAddedBy;
          });
        });

        return {
          remaining: sortByAddedAtAscending([...nextRemaining, ...mergedPending]),
          watched: (watchedEvents || []).map((event) => {
            const eventWithProfile = attachContributorProfile(
              event,
              profileEmailByUserId
            );
            return {
              ...eventWithProfile,
              drawEventId: event.id,
              bowlMovieId: event.source_bowl_movie_id,
            };
          }),
        };
      });
    } catch (err) {
      console.error("[useBowl] Unexpected error loading bowl movies", err);
      failedWhileOfflineRef.current = isOfflineError(err);
      setErrorMessage(
        describeNetworkError(err, "Unexpected error loading bowl movies.")
      );
      setBowl({ remaining: [], watched: [] });
    } finally {
      setIsLoading(false);
    }
  }, [bowlId]);

  useEffect(() => {
    // Load DB-backed bowl movies whenever the bowl changes.
    loadBowlMovies();
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
    await loadBowlMovies();

    return {
      ...drawn,
      streamingProviders: selected.providers || [],
      streamingRegion: selected.region || "US",
      streamingFetchedAt: selected.fetchedAt || null,
    };
  }, [bowlId, bowl.remaining, loadBowlMovies, drawMethod, filterMetadataFetchers]);

  // Insert a movie into the DB for this bowl. We store snapshot fields from TMDB.
  const handleAddMovie = useCallback(
    async (movie) => {
      if (!bowlId || !movie?.title || !String(movie.title).trim()) {
        return addResult(false, "invalid_movie", "Choose a movie to add.");
      }
      const noteValidationError = getMovieNoteValidationError(movie?.note);
      if (noteValidationError) {
        return addResult(false, "comment_too_long", noteValidationError);
      }
      if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
        return addResult(
          false,
          "limit_reached",
          `Bowl is at the undrawn movie limit (${MAX_UNDRAWN_MOVIES_PER_BOWL}).`
        );
      }

      const normalizedTitle = String(movie.title).trim().toLowerCase();
      const movieTmdbId = getPositiveTmdbId(movie);
      const addLockKey =
        movieTmdbId && movieTmdbId > 0 ? `tmdb:${movieTmdbId}` : `custom:${normalizedTitle}`;

      const activeDuplicate = movieTmdbId == null
        ? null
        : (bowl.remaining || []).find(
            (existingMovie) => getPositiveTmdbId(existingMovie) === movieTmdbId
          );
      if (activeDuplicate) {
        return addResult(
          false,
          "duplicate_movie",
          getDuplicateMovieMessage(movie, activeDuplicate)
        );
      }

      if (addRequestsInFlightRef.current.has(addLockKey)) {
        return addResult(
          false,
          "duplicate_movie",
          getDuplicateMovieMessage(movie, activeDuplicate)
        );
      }

      // Skip the optimistic row entirely when the write cannot land: showing a
      // "syncing" slip that is certain to vanish is worse than a clear refusal.
      if (isOffline()) {
        setErrorMessage(OFFLINE_MESSAGE);
        return addResult(false, "offline", OFFLINE_MESSAGE);
      }

      addRequestsInFlightRef.current.add(addLockKey);

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;
      const accessToken = authData?.session?.access_token;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        addRequestsInFlightRef.current.delete(addLockKey);
        return addResult(false, "not_authenticated", "You must be signed in to add a movie.");
      }

      setErrorMessage(null);

      const nowIso = new Date().toISOString();
      const localTempId = createLocalTempId();

      // Normalize genres into a simple string array.
      const genreNames = Array.isArray(movie?.genres)
        ? movie.genres
          .map((g) => (typeof g === "string" ? g : g?.name))
          .filter(Boolean)
        : [];

      const payload = {
        bowl_id: bowlId,
        added_by: user.id,
        tmdb_id: movieTmdbId,
        title: String(movie.title).trim(),
        poster_path: movie.poster_path ?? null,
        release_date: movie.release_date ?? null,
        runtime: movie.runtime ?? null,
        genres: genreNames,
        overview: movie.overview ?? null,
        note: normalizeMovieNote(movie.note),
        is_pinned: false,
        snapshot_at: nowIso,
      };

      const optimisticMovie = {
        ...payload,
        id: localTempId,
        local_temp_id: localTempId,
        local_status: "syncing",
        added_at: nowIso,
        drawn_at: null,
        drawn_by: null,
        profiles: user?.email ? { email: user.email } : undefined,
      };

      setBowl((prev) => ({
        ...prev,
        remaining: sortByAddedAtAscending([...(prev.remaining || []), optimisticMovie]),
      }));

      const insertMovieRow = async (rowPayload) => {
        return supabase
          .from("bowl_movies")
          .insert([rowPayload])
          .select(
            "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, note, is_pinned, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at"
          )
          .single();
      };

      try {
        let { data, error } = await insertMovieRow(payload);

        // Some deployments keep tmdb_id as NOT NULL. For custom entries, retry with
        // a synthetic negative ID so the row can still be inserted.
        if (error && payload.tmdb_id == null) {
          const fallbackPayload = {
            ...payload,
            tmdb_id: createSyntheticTmdbId(),
          };
          const retryResult = await insertMovieRow(fallbackPayload);
          data = retryResult.data;
          error = retryResult.error;
        }

        if (error) {
          throw error;
        }

        const persistedMovie = Array.isArray(data) ? data[0] : data;
        setBowl((prev) => ({
          ...prev,
          remaining: sortByAddedAtAscending(
            (prev.remaining || []).map((item) => {
              if (item?.local_temp_id !== localTempId) return item;
              return {
                ...item,
                ...(persistedMovie || {}),
                id: persistedMovie?.id || item.id,
                local_temp_id: null,
                local_status: null,
              };
            })
          ),
        }));
        if (movieTmdbId && accessToken) {
          // This route is member-only; public add links never warm metered data.
          void fetchProviderLinks(movieTmdbId, bowlId).catch(() => {});
          Promise.resolve()
            .then(() => warmTmdbMovieFilterMetadata(movieTmdbId, bowlId, accessToken))
            .catch((error) => {
              console.error("[useBowl] Failed to warm filter metadata", error);
            });
        }
        return addResult(true);
      } catch (error) {
        const duplicateMovie = isDuplicateMovieError(error);
        if (!duplicateMovie) {
          console.error("[useBowl] Failed to add movie", error);
        }
        setBowl((prev) => ({
          ...prev,
          remaining: (prev.remaining || []).filter((item) => item?.local_temp_id !== localTempId),
        }));
        const message = duplicateMovie
          ? getDuplicateMovieMessage(movie, activeDuplicate)
          : describeNetworkError(error, "Could not add this movie. Please try again.");
        setErrorMessage(message);
        return addResult(
          false,
          duplicateMovie ? "duplicate_movie" : "add_failed",
          message
        );
      } finally {
        addRequestsInFlightRef.current.delete(addLockKey);
      }
    },
    [bowlId, bowl.remaining]
  );

  const handleUpdateMovieNote = useCallback(
    async (movieId, note) => {
      if (!bowlId || !movieId) {
        return addResult(false, "invalid_movie", "Choose a movie comment to edit.");
      }

      const validationError = getMovieNoteValidationError(note);
      if (validationError) {
        return addResult(false, "comment_too_long", validationError);
      }
      if (isOffline()) {
        return addResult(false, "offline", OFFLINE_MESSAGE);
      }

      try {
        const { data, error } = await supabase.rpc("update_own_bowl_movie_note", {
          p_bowl_movie_id: movieId,
          p_note: normalizeMovieNote(note),
        });

        if (error) {
          console.error("[useBowl] Failed to update movie comment", error);
          const message = getNoteUpdateFailureMessage(error);
          await loadBowlMovies();
          return addResult(false, "comment_update_failed", message);
        }

        const updatedMovie = Array.isArray(data) ? data[0] : data;
        const normalizedNote = normalizeMovieNote(updatedMovie?.note ?? note);
        setBowl((prev) => ({
          ...prev,
          remaining: (prev.remaining || []).map((movie) =>
            String(movie?.id || "") === String(movieId)
              ? { ...movie, ...(updatedMovie || {}), note: normalizedNote }
              : movie
          ),
        }));
        return {
          ...addResult(true),
          movie: updatedMovie || { id: movieId, note: normalizedNote },
        };
      } catch (error) {
        console.error("[useBowl] Unexpected error updating movie comment", error);
        return addResult(
          false,
          "comment_update_failed",
          getNoteUpdateFailureMessage(error)
        );
      }
    },
    [bowlId, loadBowlMovies]
  );

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

  const handleDeleteMovie = useCallback(
    async (movieId) => {
      if (!bowlId || !movieId) return false;

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        return false;
      }

      const { error } = await supabase
        .from("bowl_movies")
        .delete()
        .eq("id", movieId)
        .eq("bowl_id", bowlId)
        .eq("added_by", user.id)
        .is("drawn_at", null);

      if (error) {
        console.error("[useBowl] Failed to delete movie", error);
        // This path only reports a boolean, so an offline failure would
        // otherwise disappear: surface it on the shared error line.
        if (isOfflineError(error)) setErrorMessage(OFFLINE_MESSAGE);
        return false;
      }

      await loadBowlMovies();
      return true;
    },
    [bowlId, loadBowlMovies]
  );

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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { getDrawSelection } from "../utils/drawSelection";

function createSyntheticTmdbId() {
  // Keep this within signed 32-bit range to avoid common integer column overflows.
  const min = 1;
  const max = 2_000_000_000;
  return -Math.floor(Math.random() * (max - min + 1)) - min;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function sortByAddedAtAscending(movies = []) {
  return [...movies].sort((a, b) => {
    const aTime = new Date(a?.added_at || 0).getTime();
    const bTime = new Date(b?.added_at || 0).getTime();
    return aTime - bTime;
  });
}

function sortByQueuedAtAscending(rows = []) {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a?.queued_at || 0).getTime();
    const bTime = new Date(b?.queued_at || 0).getTime();
    return aTime - bTime;
  });
}

function createLocalTempId() {
  return `temp:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
}
// useBowl is the core state engine for a bowl.
// It manages bowl state and defines how that state transitions (add + draw).

export default function useBowl(bowlId) {
  // Primary bowl state:
  // - remaining: movies not yet drawn (drawn_at is null)
  // - watched: movies that have been drawn (drawn_at is not null)
  const [bowl, setBowl] = useState({
    remaining: [],
    watched: [],
  });
  const [queue, setQueue] = useState({
    pending: [],
    promoted: [],
  });

  // Simple loading/error flags for DB-backed state.
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [queueMessage, setQueueMessage] = useState(null);
  const addRequestsInFlightRef = useRef(new Set());

  // Contribution stats can be computed from DB-backed rows.
  // For MVP we compute client-side; later this can be a SQL aggregate/view.
  const contributions = useMemo(() => {
    const counts = {};

    // Count contributions across both remaining + watched.
    [...(bowl.remaining || []), ...(bowl.watched || [])].forEach((m) => {
      // Use the adder's email as a temporary display label until we add display names.
      const key = m.profiles?.email || m.added_by || "Unknown";
      counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
  }, [bowl.remaining, bowl.watched]);

  const loadBowlMovies = useCallback(async () => {
    if (!bowlId) {
      setBowl({ remaining: [], watched: [] });
      setQueue({ pending: [], promoted: [] });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        setBowl({ remaining: [], watched: [] });
        setQueue({ pending: [], promoted: [] });
        return;
      }

      // Remaining movies
      const { data: remaining, error: remainingError } = await supabase
        .from("bowl_movies")
        .select(
          "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
        )
        .eq("bowl_id", bowlId)
        .is("drawn_at", null)
        .order("added_at", { ascending: true });

      if (remainingError) {
        console.error("[useBowl] Failed to load remaining movies", remainingError);
        setErrorMessage("Failed to load remaining movies.");
      }

      // Watched movies
      const { data: watched, error: watchedError } = await supabase
        .from("bowl_movies")
        .select(
          "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
        )
        .eq("bowl_id", bowlId)
        .not("drawn_at", "is", null)
        .order("drawn_at", { ascending: false });

      if (watchedError) {
        console.error("[useBowl] Failed to load watched movies", watchedError);
        setErrorMessage("Failed to load watched movies.");
      }

      setBowl((prev) => {
        const pendingRemaining = (prev.remaining || []).filter(
          (movie) => movie?.local_status === "syncing"
        );
        const nextRemaining = remaining || [];

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
          watched: watched || [],
        };
      });

      const { data: queuedRows, error: queueError } = await supabase
        .from("bowl_movie_queue")
        .select(
          "id, bowl_id, queued_by, tmdb_id, title, poster_path, release_date, runtime, genres, overview, snapshot_at, queued_at, promoted_at, removed_at"
        )
        .eq("bowl_id", bowlId)
        .eq("queued_by", user.id)
        .is("removed_at", null)
        .order("queued_at", { ascending: true });

      if (queueError) {
        const message = String(queueError?.message || "").toLowerCase();
        const isMissingQueueTable = message.includes("bowl_movie_queue") && message.includes("does not exist");
        if (!isMissingQueueTable) {
          console.error("[useBowl] Failed to load queue rows", queueError);
        }
        setQueue({ pending: [], promoted: [] });
      } else {
        const rows = queuedRows || [];
        setQueue({
          pending: rows.filter((row) => !row.promoted_at),
          promoted: rows.filter((row) => Boolean(row.promoted_at)),
        });
      }
    } catch (err) {
      console.error("[useBowl] Unexpected error loading bowl movies", err);
      setErrorMessage("Unexpected error loading bowl movies.");
      setBowl({ remaining: [], watched: [] });
      setQueue({ pending: [], promoted: [] });
    } finally {
      setIsLoading(false);
    }
  }, [bowlId]);

  useEffect(() => {
    // Load DB-backed bowl movies whenever the bowl changes.
    loadBowlMovies();
  }, [loadBowlMovies]);

  // Randomly select a movie from remaining, mark it as drawn in the DB,
  // and reload the remaining/watched lists.
  const handleDraw = useCallback(async (options = {}) => {
    if (!bowlId) return null;
    const drawableRemaining = (bowl.remaining || []).filter(
      (movie) => movie?.local_status !== "syncing"
    );
    if (drawableRemaining.length === 0) return null;
    setErrorMessage(null);

    const { selected, errorMessage: drawError } = await getDrawSelection({
      remainingMovies: drawableRemaining,
      prioritizeByServices: options.prioritizeByServices,
      prioritizeByServiceRank: options.prioritizeByServiceRank,
      userStreamingServices: options.userStreamingServices,
      ratingFilter: options.ratingFilter,
      genreFilter: options.genreFilter,
      runtimeFilter: options.runtimeFilter,
      fetchProviders: (tmdbId) => fetchStreamingProviders(tmdbId, { region: "US" }),
      fetchMovieDetails: (tmdbId) => getTmdbMovieDetails(tmdbId),
    });
    if (drawError) {
      setErrorMessage(drawError);
      return null;
    }

    if (!selected) return null;

    const drawn = selected.movie;

    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    if (authError || !user) {
      console.error("[useBowl] Not authenticated", authError);
      return null;
    }

    const matchesDrawnMovie = (movie) => {
      if (Number(drawn?.tmdb_id) > 0) {
        return Number(movie?.tmdb_id) === Number(drawn.tmdb_id);
      }
      return String(movie?.title || "").trim() === String(drawn?.title || "").trim();
    };

    const matchingUndrawnRows = drawableRemaining.filter(matchesDrawnMovie);
    const canonicalRow = matchingUndrawnRows[0] || drawn;
    const duplicateRows = matchingUndrawnRows.slice(1);

    const { error: updateError } = await supabase
      .from("bowl_movies")
      .update({ drawn_at: new Date().toISOString(), drawn_by: user.id })
      .eq("bowl_id", bowlId)
      .is("drawn_at", null)
      .eq("id", canonicalRow.id);

    if (updateError) {
      console.error("[useBowl] Failed to draw movie", updateError);
      const errorCode = String(updateError?.code || "");
      const errorMessageText = String(updateError?.message || "").toLowerCase();
      const isPermissionDenied =
        errorCode === "42501" || errorMessageText.includes("permission denied");
      if (isPermissionDenied) {
        setErrorMessage("You don't have permission to draw in this bowl.");
      }
      return null;
    }

    if (duplicateRows.length > 0) {
      const duplicateIds = duplicateRows.map((movie) => movie.id).filter(Boolean);
      if (duplicateIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("bowl_movies")
          .delete()
          .eq("bowl_id", bowlId)
          .is("drawn_at", null)
          .in("id", duplicateIds);

        if (deleteError) {
          console.error("[useBowl] Failed to remove duplicate undrawn rows after draw", deleteError);
          setErrorMessage("Could not finalize draw because duplicate cleanup failed.");
          await loadBowlMovies();
          return null;
        }
      }
    }

    // Reload after updating.
    await loadBowlMovies();

    return {
      ...drawn,
      streamingProviders: selected.providers || [],
      streamingRegion: selected.region || "US",
      streamingFetchedAt: selected.fetchedAt || null,
    };
  }, [bowlId, bowl.remaining, loadBowlMovies]);

  // Insert a movie into the DB for this bowl. We store snapshot fields from TMDB.
  const handleAddMovie = useCallback(
    async (movie) => {
      if (!bowlId) return false;
      if (!movie?.title || !String(movie.title).trim()) return false;
      if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
        return false;
      }

      const normalizedTitle = String(movie.title).trim().toLowerCase();
      const movieTmdbId = Number.isInteger(movie?.id) ? movie.id : null;
      const addLockKey =
        movieTmdbId && movieTmdbId > 0 ? `tmdb:${movieTmdbId}` : `custom:${normalizedTitle}`;

      if (addRequestsInFlightRef.current.has(addLockKey)) {
        return false;
      }
      addRequestsInFlightRef.current.add(addLockKey);

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        addRequestsInFlightRef.current.delete(addLockKey);
        return false;
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
            "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
          )
          .single();
      };

      const persistInsert = async () => {
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
                  ...(persistedMovie || item),
                  id: persistedMovie?.id || item.id,
                  local_temp_id: null,
                  local_status: null,
                };
              })
            ),
          }));
        } catch (error) {
          console.error("[useBowl] Failed to add movie", error);
          setBowl((prev) => ({
            ...prev,
            remaining: (prev.remaining || []).filter((item) => item?.local_temp_id !== localTempId),
          }));
          setErrorMessage("Could not add this movie. Please try again.");
        } finally {
          addRequestsInFlightRef.current.delete(addLockKey);
        }
      };

      void persistInsert();
      return true;
    },
    [bowlId, bowl.remaining]
  );

  const handleQueueMovie = useCallback(
    async (movie) => {
      if (!bowlId) return false;
      if (!movie?.title || !String(movie.title).trim()) return false;
      const normalizedTitle = String(movie.title).trim().toLowerCase();
      const movieTmdbId = Number.isInteger(movie?.id) ? movie.id : null;
      const queueLockKey =
        movieTmdbId && movieTmdbId > 0 ? `queue:tmdb:${movieTmdbId}` : `queue:custom:${normalizedTitle}`;

      if (addRequestsInFlightRef.current.has(queueLockKey)) return false;
      addRequestsInFlightRef.current.add(queueLockKey);
      setQueueMessage(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getSession();
        const user = authData?.session?.user;

        if (authError || !user) {
          console.error("[useBowl] Not authenticated", authError);
          setErrorMessage("You must be signed in to queue movies.");
          return false;
        }

        const nowIso = new Date().toISOString();
        const genreNames = Array.isArray(movie?.genres)
          ? movie.genres
            .map((g) => (typeof g === "string" ? g : g?.name))
            .filter(Boolean)
          : [];

        let payload = {
          bowl_id: bowlId,
          queued_by: user.id,
          tmdb_id: movieTmdbId,
          title: String(movie.title).trim(),
          poster_path: movie.poster_path ?? null,
          release_date: movie.release_date ?? null,
          runtime: movie.runtime ?? null,
          genres: genreNames,
          overview: movie.overview ?? null,
          snapshot_at: nowIso,
        };

        let { data, error } = await supabase
          .from("bowl_movie_queue")
          .insert([payload])
          .select(
            "id, bowl_id, queued_by, tmdb_id, title, poster_path, release_date, runtime, genres, overview, snapshot_at, queued_at, promoted_at, removed_at"
          )
          .single();

        if (error && payload.tmdb_id == null) {
          payload = {
            ...payload,
            tmdb_id: createSyntheticTmdbId(),
          };
          const retry = await supabase
            .from("bowl_movie_queue")
            .insert([payload])
            .select(
              "id, bowl_id, queued_by, tmdb_id, title, poster_path, release_date, runtime, genres, overview, snapshot_at, queued_at, promoted_at, removed_at"
            )
            .single();
          data = retry.data;
          error = retry.error;
        }

        if (error) {
          console.error("[useBowl] Failed to queue movie", error);
          setErrorMessage("Could not queue this movie. Please try again.");
          return false;
        }

        setQueue((prev) => ({
          ...prev,
          pending: sortByQueuedAtAscending([...(prev.pending || []), data]),
        }));
        setQueueMessage("Added to your queue. It will auto-add when you're eligible.");
        return true;
      } finally {
        addRequestsInFlightRef.current.delete(queueLockKey);
      }
    },
    [bowlId]
  );

  const handleRemoveQueuedMovie = useCallback(
    async (queueId) => {
      if (!bowlId || !queueId) return false;

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        return false;
      }

      const { error } = await supabase
        .from("bowl_movie_queue")
        .delete()
        .eq("id", queueId)
        .eq("bowl_id", bowlId)
        .eq("queued_by", user.id)
        .is("promoted_at", null)
        .is("removed_at", null);

      if (error) {
        console.error("[useBowl] Failed to remove queued movie", error);
        return false;
      }

      setQueue((prev) => ({
        ...prev,
        pending: (prev.pending || []).filter((row) => row.id !== queueId),
      }));
      return true;
    },
    [bowlId]
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
        return false;
      }

      await loadBowlMovies();
      return true;
    },
    [bowlId, loadBowlMovies]
  );

  const handleReaddMovie = useCallback(
    async (movieId) => {
      if (!bowlId || !movieId) return false;
      if ((bowl.remaining || []).length >= MAX_UNDRAWN_MOVIES_PER_BOWL) {
        return false;
      }

      // Defensive fallback: if a TMDB id slips through from enriched UI data,
      // map it back to the corresponding watched bowl row UUID.
      let targetRowId = movieId;
      if (!looksLikeUuid(movieId)) {
        const movieIdNumber = Number(movieId);
        if (Number.isFinite(movieIdNumber)) {
          const matchedWatchedRow = (bowl.watched || []).find(
            (movie) => Number(movie?.tmdb_id) === movieIdNumber
          );
          if (matchedWatchedRow?.id) {
            targetRowId = matchedWatchedRow.id;
          }
        }
      }

      if (!looksLikeUuid(targetRowId)) {
        const matchesExistingRowId = (bowl.watched || []).some(
          (movie) => String(movie?.id || "") === String(targetRowId)
        );
        if (matchesExistingRowId) {
          // Test fixtures and some local mocks may use non-UUID ids.
          // If the id maps to an existing watched row, allow it.
        } else {
          console.error("[useBowl] Invalid re-add movie id", { movieId, targetRowId });
          return false;
        }
      }

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        return false;
      }

      const { error } = await supabase
        .from("bowl_movies")
        .update({ drawn_at: null, drawn_by: null })
        .eq("id", targetRowId)
        .eq("bowl_id", bowlId)
        .not("drawn_at", "is", null);

      if (error) {
        console.error("[useBowl] Failed to re-add watched movie", error);
        return false;
      }

      await loadBowlMovies();
      return true;
    },
    [bowlId, bowl.remaining, loadBowlMovies]
  );

  return {
    bowl,
    queue,
    contributions,
    isLoading,
    errorMessage,
    queueMessage,
    reload: loadBowlMovies,
    handleDraw,
    handleAddMovie,
    handleQueueMovie,
    handleRemoveQueuedMovie,
    handleDeleteMovie,
    handleReaddMovie,
  };
}

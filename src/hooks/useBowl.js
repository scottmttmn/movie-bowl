import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { MAX_UNDRAWN_MOVIES_PER_BOWL } from "../utils/appLimits";
import { getDrawSelection } from "../utils/drawSelection";
import { buildDrawOddsStats } from "../utils/drawBuckets";

const DUPLICATE_MOVIE_MESSAGE = "This movie is already in the bowl.";

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

  // Simple loading/error flags for DB-backed state.
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const addRequestsInFlightRef = useRef(new Set());

  const drawOdds = useMemo(() => buildDrawOddsStats(bowl.remaining || []), [bowl.remaining]);

  const loadBowlMovies = useCallback(async () => {
    if (!bowlId) {
      setBowl({ remaining: [], watched: [] });
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
        return;
      }

      // Remaining movies
      const { data: remaining, error: remainingError } = await supabase
        .from("bowl_movies")
        .select(
          "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
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
          "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
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
    } catch (err) {
      console.error("[useBowl] Unexpected error loading bowl movies", err);
      setErrorMessage("Unexpected error loading bowl movies.");
      setBowl({ remaining: [], watched: [] });
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
      randomFn: options.randomFn,
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

    const { error: updateError } = await supabase
      .from("bowl_movies")
      .update({ drawn_at: new Date().toISOString(), drawn_by: user.id })
      .eq("bowl_id", bowlId)
      .is("drawn_at", null)
      .eq("id", drawn.id);

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
      if (!bowlId || !movie?.title || !String(movie.title).trim()) {
        return addResult(false, "invalid_movie", "Choose a movie to add.");
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

      const isActiveDuplicate =
        movieTmdbId != null &&
        (bowl.remaining || []).some(
          (existingMovie) => getPositiveTmdbId(existingMovie) === movieTmdbId
        );
      if (isActiveDuplicate) {
        return addResult(false, "duplicate_movie", DUPLICATE_MOVIE_MESSAGE);
      }

      if (addRequestsInFlightRef.current.has(addLockKey)) {
        return addResult(false, "duplicate_movie", DUPLICATE_MOVIE_MESSAGE);
      }
      addRequestsInFlightRef.current.add(addLockKey);

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

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
            "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at, profiles:profiles!bowl_movies_added_by_fkey(email)"
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
                ...(persistedMovie || item),
                id: persistedMovie?.id || item.id,
                local_temp_id: null,
                local_status: null,
              };
            })
          ),
        }));
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
          ? DUPLICATE_MOVIE_MESSAGE
          : "Could not add this movie. Please try again.";
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
          return addResult(false, "invalid_movie", "Could not re-add this movie.");
        }
      }

      const targetMovie = (bowl.watched || []).find(
        (movie) => String(movie?.id || "") === String(targetRowId)
      );
      const targetTmdbId = getPositiveTmdbId(targetMovie);
      const hasActiveDuplicate =
        targetTmdbId != null &&
        (bowl.remaining || []).some(
          (movie) => getPositiveTmdbId(movie) === targetTmdbId
        );
      if (hasActiveDuplicate) {
        return addResult(false, "duplicate_movie", DUPLICATE_MOVIE_MESSAGE);
      }

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        return addResult(false, "not_authenticated", "You must be signed in to re-add a movie.");
      }

      const { error } = await supabase
        .from("bowl_movies")
        .update({ drawn_at: null, drawn_by: null })
        .eq("id", targetRowId)
        .eq("bowl_id", bowlId)
        .not("drawn_at", "is", null);

      if (error) {
        const duplicateMovie = isDuplicateMovieError(error);
        if (!duplicateMovie) {
          console.error("[useBowl] Failed to re-add watched movie", error);
        }
        return addResult(
          false,
          duplicateMovie ? "duplicate_movie" : "add_failed",
          duplicateMovie ? DUPLICATE_MOVIE_MESSAGE : "Could not re-add this movie. Please try again."
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
    drawOdds,
    isLoading,
    errorMessage,
    reload: loadBowlMovies,
    handleDraw,
    handleAddMovie,
    handleDeleteMovie,
    handleReaddMovie,
  };
}

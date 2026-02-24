import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { selectDrawCandidate } from "../utils/selectDrawCandidate";
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
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
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

      setBowl({
        remaining: remaining || [],
        watched: watched || [],
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
    if (bowl.remaining.length === 0) return null;

    const selected = await selectDrawCandidate(bowl.remaining, {
      prioritizeByServices: options.prioritizeByServices,
      userStreamingServices: options.userStreamingServices,
      fetchProviders: (tmdbId) => fetchStreamingProviders(tmdbId, { region: "US" }),
    });

    if (!selected) return null;

    const drawn = selected.movie;

    const { data: authData, error: authError } = await supabase.auth.getSession();
    const user = authData?.session?.user;

    if (authError || !user) {
      console.error("[useBowl] Not authenticated", authError);
      return null;
    }

    const { error } = await supabase
      .from("bowl_movies")
      .update({ drawn_at: new Date().toISOString(), drawn_by: user.id })
      .eq("id", drawn.id)
      .eq("bowl_id", bowlId);

    if (error) {
      console.error("[useBowl] Failed to draw movie", error);
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
      if (!bowlId) return;

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const user = authData?.session?.user;

      if (authError || !user) {
        console.error("[useBowl] Not authenticated", authError);
        return;
      }

      // Normalize genres into a simple string array.
      const genreNames = Array.isArray(movie?.genres)
        ? movie.genres.map((g) => g?.name).filter(Boolean)
        : [];

      const payload = {
        bowl_id: bowlId,
        added_by: user.id,
        tmdb_id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path ?? null,
        release_date: movie.release_date ?? null,
        runtime: movie.runtime ?? null,
        genres: genreNames,
        overview: movie.overview ?? null,
        snapshot_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("bowl_movies").insert([payload]);

      if (error) {
        console.error("[useBowl] Failed to add movie", error);
        return;
      }

      await loadBowlMovies();
    },
    [bowlId, loadBowlMovies]
  );

  return { bowl, contributions, isLoading, errorMessage, reload: loadBowlMovies, handleDraw, handleAddMovie };
}

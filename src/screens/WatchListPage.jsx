import { useEffect, useMemo, useState } from "react";
import AddMovieModal from "../components/AddMovieModal";
import { getPosterUrl } from "../utils/getPosterUrl";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";

function formatWatchedDate(value) {
  return value ? new Date(value).toLocaleDateString() : null;
}

export default function WatchListPage() {
  const [movies, setMovies] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [selectedDetailMovie, setSelectedDetailMovie] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadWatchList = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const { data: authData, error: authError } = await supabase.auth.getSession();
        const user = authData?.session?.user;

        if (authError || !user) {
          if (!cancelled) {
            setMovies([]);
          }
          return;
        }

        const [{ data: ownedRows, error: ownedError }, { data: memberRows, error: memberError }] =
          await Promise.all([
            supabase.from("bowls").select("id").eq("owner_id", user.id),
            supabase.from("bowl_members").select("bowl_id").eq("user_id", user.id),
          ]);

        if (ownedError || memberError) {
          console.error("[WatchListPage] Failed to load user bowl access", ownedError || memberError);
          if (!cancelled) {
            setMovies([]);
            setErrorMessage("Failed to load your watch list.");
          }
          return;
        }

        const bowlIds = [...new Set([...(ownedRows || []).map((row) => row.id), ...(memberRows || []).map((row) => row.bowl_id)])]
          .filter(Boolean);

        if (bowlIds.length === 0) {
          if (!cancelled) {
            setMovies([]);
          }
          return;
        }

        const { data: watchedRows, error: watchedError } = await supabase
          .from("bowl_movies")
          .select(
            "id, bowl_id, tmdb_id, title, poster_path, release_date, runtime, genres, overview, added_by, added_by_name, added_at, drawn_at, drawn_by, snapshot_at, bowls(name), profiles:profiles!bowl_movies_added_by_fkey(email)"
          )
          .in("bowl_id", bowlIds)
          .not("drawn_at", "is", null)
          .order("drawn_at", { ascending: false });

        if (watchedError) {
          console.error("[WatchListPage] Failed to load watched movies", watchedError);
          if (!cancelled) {
            setMovies([]);
            setErrorMessage("Failed to load your watch list.");
          }
          return;
        }

        if (!cancelled) {
          setMovies(watchedRows || []);
        }
      } catch (error) {
        console.error("[WatchListPage] Unexpected error", error);
        if (!cancelled) {
          setMovies([]);
          setErrorMessage("Unexpected error loading your watch list.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadWatchList();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildDetailMovie = async (movie) => {
    const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
    const shouldFetchTmdbDetails = Number.isInteger(tmdbId) && tmdbId > 0;

    if (!shouldFetchTmdbDetails) {
      return {
        ...movie,
        streamingProviders: movie.streamingProviders || [],
        streamingRegion: movie.streamingRegion || "US",
        streamingFetchedAt: movie.streamingFetchedAt || null,
      };
    }

    const [detailsResult, providersResult] = await Promise.allSettled([
      getTmdbMovieDetails(tmdbId),
      fetchStreamingProviders(tmdbId, { region: "US" }),
    ]);

    if (detailsResult.status === "rejected") {
      console.error("[WatchListPage] Failed to load TMDB detail enrichment", detailsResult.reason);
    }
    if (providersResult.status === "rejected") {
      console.error("[WatchListPage] Failed to load streaming provider enrichment", providersResult.reason);
    }

    const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
    const providerData =
      providersResult.status === "fulfilled"
        ? providersResult.value
        : { providers: [], region: "US", fetchedAt: null };

    return {
      ...(details || {}),
      ...movie,
      bowlMovieId: movie?.id ?? null,
      streamingProviders: providerData.providers || [],
      streamingRegion: providerData.region || "US",
      streamingFetchedAt: providerData.fetchedAt || null,
    };
  };

  const rows = useMemo(
    () =>
      (movies || []).map((movie) => ({
        ...movie,
        bowlName: movie?.bowls?.name || "Movie Bowl",
        watchedDateLabel: formatWatchedDate(movie?.drawn_at),
        year: movie?.release_date ? String(movie.release_date).split("-")[0] : "—",
        posterUrl: getPosterUrl(movie, "w200"),
      })),
    [movies]
  );

  return (
    <div className="page-container py-6">
      <section className="panel max-w-5xl mx-auto">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">History</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-100">Watch List</h1>
          <p className="mt-2 text-base text-slate-300">
            Watched movies from every bowl you currently own or belong to.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading your watch list…</p>
        ) : errorMessage ? (
          <div className="rounded-xl bg-red-950/50 px-4 py-3 text-sm text-red-300">{errorMessage}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/50 px-5 py-8 text-center">
            <p className="text-lg font-medium text-slate-200">No watched movies yet</p>
            <p className="mt-2 text-sm text-slate-400">
              As movies are drawn in your bowls, they’ll show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((movie) => (
              <button
                key={movie.id}
                type="button"
                onClick={async () => {
                  setSelectedDetailMovie(await buildDetailMovie(movie));
                }}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-700 bg-slate-950/50 p-3 text-left transition hover:border-slate-600 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700"
              >
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="h-24 w-16 flex-shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 className="text-lg font-semibold text-slate-100">{movie.title}</h2>
                    <span className="text-sm text-slate-400">({movie.year})</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{movie.bowlName}</p>
                  {movie.watchedDateLabel && (
                    <p className="mt-1 text-sm text-slate-400">Watched on {movie.watchedDateLabel}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedDetailMovie && (
        <AddMovieModal
          movie={selectedDetailMovie}
          userStreamingServices={[]}
          onClose={() => setSelectedDetailMovie(null)}
        />
      )}
    </div>
  );
}

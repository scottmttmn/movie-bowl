import React, { useEffect, useMemo, useState } from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { matchUserServices, normalizeStreamingServices } from "../utils/streamingServices";

export default function AddMovieModal({
  movie,
  onClose,
  onAddMovie,
  userStreamingServices = [],
  detailPrimaryActionLabel = null,
  onDetailPrimaryAction = null,
}) {
  const [isTrailerVisible, setIsTrailerVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    setIsTrailerVisible(false);
  }, [movie]);

  // This modal is used in two contexts:
  // 1) "Add movie" flow (movie is undefined): show search UI.
  // 2) "Just drawn" flow (movie is defined): show details for the drawn movie.
  if (!movie) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 p-6 relative text-left">
          <button
            onClick={onClose}
            className="icon-btn absolute top-4 right-4"
            aria-label="Close"
          >
            ✕
          </button>

          <h2 className="text-2xl font-semibold mb-4 text-slate-800">Add a movie</h2>

          {/* MovieSearch handles TMDB search + details fetch and returns a full movie object */}
          <MovieSearch
            userStreamingServices={userStreamingServices}
            onAddMovie={async (selectedMovie) => {
              // Parent is responsible for persisting to Supabase.
              if (onAddMovie) {
                await onAddMovie(selectedMovie);
              }
            }}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  // Compute poster URL in the UI so we can store raw TMDB poster_path in the DB.
  const posterUrl = getPosterUrl(movie, "w500");

  const year = movie.release_date
    ? movie.release_date.split("-")[0]
    : "—";
  const resolvedMovieId = movie.tmdb_id ?? movie.id ?? null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || resolvedMovieId == null || Number(resolvedMovieId) <= 0
  );
  const watchedAt = movie.drawn_at || movie.drawnAt || null;
  const watchedDateLabel = watchedAt ? new Date(watchedAt).toLocaleDateString() : null;
  const availableProviders = normalizeStreamingServices(movie.streamingProviders || []);
  const matchingProviders = matchUserServices(availableProviders, userStreamingServices);
  const hasTrailer = useMemo(
    () => movie?.trailer?.site === "YouTube" && Boolean(movie?.trailer?.key),
    [movie]
  );
  const trailerRegionId = resolvedMovieId != null
    ? `movie-trailer-${String(resolvedMovieId).replace(/[^a-zA-Z0-9_-]+/g, "-")}`
    : "movie-trailer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 p-6 relative max-h-[90vh] overflow-y-auto text-left">
        <button
          onClick={onClose}
          className="icon-btn absolute top-4 right-4"
          aria-label="Close"
        >
          ✕
        </button>

        {posterUrl && (
          <div className="mb-4 max-h-[46vh] rounded bg-slate-100">
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-full max-h-[46vh] w-full rounded object-contain"
            />
          </div>
        )}

        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">
            {movie.title} ({year})
          </h2>
          {isCustomEntry && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Custom
            </span>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {movie.runtime && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              Runtime: {movie.runtime} minutes
            </span>
          )}
          {watchedDateLabel && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              Watched on: {watchedDateLabel}
            </span>
          )}
        </div>

        {hasTrailer && (
          <div className="mb-4">
            <button
              type="button"
              className="btn btn-secondary px-3 py-2 text-sm"
              aria-expanded={isTrailerVisible}
              aria-controls={trailerRegionId}
              onClick={() => setIsTrailerVisible((prev) => !prev)}
            >
              {isTrailerVisible ? "Hide Trailer" : "Show Trailer"}
            </button>
            {isTrailerVisible && (
              <div
                id={trailerRegionId}
                className="mt-3 aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                <iframe
                  src={movie.trailer.embedUrl}
                  title={`${movie.title} trailer`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        )}

        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">Available on</p>
          {availableProviders.length > 0 ? (
            <p className="text-sm text-slate-700">{availableProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">No US streaming providers found right now.</p>
          )}
        </div>

        <div className="mb-5">
          <p className="mb-1 text-sm font-semibold text-slate-800">Your services</p>
          {matchingProviders.length > 0 ? (
            <p className="text-sm text-green-700">{matchingProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">None of your saved services match this title.</p>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          {onDetailPrimaryAction && detailPrimaryActionLabel && (
            <button
              onClick={async () => {
                await onDetailPrimaryAction(movie);
              }}
              className="btn btn-secondary"
            >
              {detailPrimaryActionLabel}
            </button>
          )}

          {/* Just dismisses the modal */}
          <button
            onClick={onClose}
            className={
              onDetailPrimaryAction && detailPrimaryActionLabel
                ? "btn btn-primary"
                : "btn btn-secondary"
            }
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

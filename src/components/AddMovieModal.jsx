import React, { useEffect, useMemo, useState } from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { matchUserServices, normalizeStreamingServices } from "../utils/streamingServices";

function getEmailLocalPart(email) {
  const normalized = String(email || "").trim();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) return null;
  return normalized.slice(0, atIndex);
}

export default function AddMovieModal({
  movie,
  onClose,
  onAddMovie,
  userStreamingServices = [],
  detailPrimaryActionLabel = null,
  onDetailPrimaryAction = null,
  preferredLaunchCandidate = null,
  preferredLaunchUnavailableReason = "",
  webLaunchCandidate = null,
  webLaunchStatus = null,
  isLaunchingPreferredService = false,
  onLaunchPreferredService = null,
  onLaunchPreferredWeb = null,
  rokuLaunchStatus = null,
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
        <div className="w-full max-w-4xl rounded-3xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl shadow-black/40">
          <button
            onClick={onClose}
            className="icon-btn absolute top-4 right-4"
            aria-label="Close"
          >
            ✕
          </button>

          <h2 className="mb-4 text-2xl font-semibold text-slate-100">Search Movies</h2>

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
  const addedByLabel = movie.added_by_name || getEmailLocalPart(movie?.profiles?.email);
  const availableProviders = normalizeStreamingServices(movie.streamingProviders || []);
  const matchingProviders = matchUserServices(availableProviders, userStreamingServices);
  const hasTrailer = useMemo(
    () => movie?.trailer?.site === "YouTube" && Boolean(movie?.trailer?.key),
    [movie]
  );
  const trailerRegionId = resolvedMovieId != null
    ? `movie-trailer-${String(resolvedMovieId).replace(/[^a-zA-Z0-9_-]+/g, "-")}`
    : "movie-trailer";
  const hasLaunchSection =
    Boolean(preferredLaunchCandidate) ||
    Boolean(webLaunchCandidate) ||
    Boolean(preferredLaunchUnavailableReason) ||
    Boolean(rokuLaunchStatus) ||
    Boolean(webLaunchStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl shadow-black/40">
        <button
          onClick={onClose}
          className="icon-btn absolute top-4 right-4"
          aria-label="Close"
        >
          ✕
        </button>

        {posterUrl && (
          <div className="mb-4 max-h-[46vh] rounded-xl bg-slate-950">
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-full max-h-[46vh] w-full rounded object-contain"
            />
          </div>
        )}

        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-100">
            {movie.title} ({year})
          </h2>
          {isCustomEntry && (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-xs font-semibold text-amber-300">
              Custom
            </span>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {movie.runtime && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300">
              Runtime: {movie.runtime} minutes
            </span>
          )}
          {watchedDateLabel && (
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300">
              Watched on: {watchedDateLabel}
            </span>
          )}
        </div>

        {addedByLabel && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-100">Added by</p>
            <p className="text-sm text-slate-300">{addedByLabel}</p>
          </div>
        )}

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
                className="mt-3 aspect-video overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
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
          <p className="mb-1 text-sm font-semibold text-slate-100">Available on</p>
          {availableProviders.length > 0 ? (
            <p className="text-sm text-slate-300">{availableProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">No US streaming providers found right now.</p>
          )}
        </div>

        <div className="mb-5">
          <p className="mb-1 text-sm font-semibold text-slate-100">Your services</p>
          {matchingProviders.length > 0 ? (
            <p className="text-sm text-emerald-300">{matchingProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-500">None of your saved services match this title.</p>
          )}
        </div>

        {hasLaunchSection && (
          <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <p className="mb-1 text-sm font-semibold text-slate-100">Open to watch</p>
            {preferredLaunchCandidate ? (
              <>
                <p className="mb-3 text-sm text-slate-400">
                  Using your highest-ranked installed match: {preferredLaunchCandidate.serviceName}.
                </p>
                <button
                  type="button"
                  onClick={onLaunchPreferredService}
                  disabled={isLaunchingPreferredService}
                  className="btn btn-primary"
                >
                  {isLaunchingPreferredService
                    ? `Opening ${preferredLaunchCandidate.serviceName}...`
                    : `Open on Roku in ${preferredLaunchCandidate.serviceName}`}
                </button>
              </>
            ) : (
              preferredLaunchUnavailableReason && (
                <p className="text-sm text-slate-400">{preferredLaunchUnavailableReason}</p>
              )
            )}

            {webLaunchCandidate && (
              <div className={preferredLaunchCandidate ? "mt-3 border-t border-slate-700 pt-3" : "mt-2"}>
                <p className="mb-2 text-sm text-slate-400">
                  Web launch match: {webLaunchCandidate.serviceName}.
                </p>
                <button
                  type="button"
                  onClick={onLaunchPreferredWeb}
                  className="btn btn-secondary"
                >
                  {`Open on Web in ${webLaunchCandidate.serviceName}`}
                </button>
              </div>
            )}

            {rokuLaunchStatus && (
              <div
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  rokuLaunchStatus.ok ? "bg-emerald-950/50 text-emerald-300" : "bg-red-950/50 text-red-300"
                }`}
              >
                <p className="font-medium">{rokuLaunchStatus.message}</p>
                {Array.isArray(rokuLaunchStatus.details) && rokuLaunchStatus.details.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {rokuLaunchStatus.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {webLaunchStatus && (
              <div
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  webLaunchStatus.ok ? "bg-emerald-950/50 text-emerald-300" : "bg-red-950/50 text-red-300"
                }`}
              >
                <p className="font-medium">{webLaunchStatus.message}</p>
                {Array.isArray(webLaunchStatus.details) && webLaunchStatus.details.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {webLaunchStatus.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

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

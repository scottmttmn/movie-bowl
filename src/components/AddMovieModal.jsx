import React, { useEffect, useState } from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { matchUserServices, normalizeStreamingServices } from "../utils/streamingServices";
import ProviderLinksAttribution from "./ProviderLinksAttribution";
import { getMovieAttributionLabel } from "../utils/drawBuckets";
import {
  MAX_MOVIE_NOTE_LENGTH,
  getMovieNoteValidationError,
  normalizeMovieNote,
} from "../utils/movieNote";

function formatDisplayDate(value) {
  if (!value) return null;

  const dateOnly = String(value).match(/^\d{4}-\d{2}-\d{2}$/);
  const date = dateOnly ? new Date(`${dateOnly[0]}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

function TrailerDisclosure({ movie, trailerRegionId }) {
  const [isTrailerVisible, setIsTrailerVisible] = useState(false);

  return (
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
  );
}

export default function AddMovieModal({
  movie,
  onClose,
  onAddMovie,
  userStreamingServices = [],
  detailPrimaryActionLabel = null,
  onDetailPrimaryAction = null,
  detailPrimaryActionError = "",
  isDetailPrimaryActionLoading = false,
  webLaunchCandidate = null,
  onEditNote = null,
  noteHeading = null,
}) {
  const [displayedNote, setDisplayedNote] = useState(() => normalizeMovieNote(movie?.note));
  const [noteDraft, setNoteDraft] = useState(() => movie?.note || "");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteEditError, setNoteEditError] = useState("");

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
    setDisplayedNote(normalizeMovieNote(movie?.note));
    setNoteDraft(movie?.note || "");
    setIsEditingNote(false);
    setIsSavingNote(false);
    setNoteEditError("");
  }, [movie?.id, movie?.note]);

  // This modal is used in two contexts:
  // 1) "Add movie" flow (movie is undefined): show search UI.
  // 2) "Just drawn" flow (movie is defined): show details for the drawn movie.
  if (!movie) {
    return (
      <div className="modal-overlay z-50" role="presentation">
        <div className="modal-surface max-h-[92vh] max-w-4xl overflow-y-auto p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="movie-search-title">
          <button
            onClick={onClose}
            className="icon-btn absolute top-4 right-4"
            aria-label="Close"
          >
            ✕
          </button>

          <h2 id="movie-search-title" className="mb-4 pr-12 text-2xl font-semibold tracking-tight text-slate-100">Search Movies</h2>

          {/* MovieSearch handles TMDB search + details fetch and returns a full movie object */}
          <MovieSearch
            userStreamingServices={userStreamingServices}
            onAddMovie={async (selectedMovie) => {
              // Parent is responsible for persisting to Supabase.
              if (onAddMovie) {
                return onAddMovie(selectedMovie);
              }
              return { ok: false, message: "Could not add this movie. Please try again." };
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
  const watchedAt = movie.watched_on || movie.drawn_at || movie.drawnAt || null;
  const watchedDateLabel = formatDisplayDate(watchedAt);
  const addedByLabel = getMovieAttributionLabel(movie);
  const availableProviders = normalizeStreamingServices(movie.streamingProviders || []);
  const matchingProviders = matchUserServices(availableProviders, userStreamingServices);
  const hasTrailer = movie?.trailer?.site === "YouTube" && Boolean(movie?.trailer?.key);
  const trailerRegionId = resolvedMovieId != null
    ? `movie-trailer-${String(resolvedMovieId).replace(/[^a-zA-Z0-9_-]+/g, "-")}`
    : "movie-trailer";
  const resolvedNoteHeading =
    noteHeading || (movie.source_kind === "manual" ? "Your comment" : "Why it’s in the bowl");

  const saveNote = async () => {
    if (!onEditNote || isSavingNote) return;

    const validationError = getMovieNoteValidationError(noteDraft);
    if (validationError) {
      setNoteEditError(validationError);
      return;
    }

    setIsSavingNote(true);
    setNoteEditError("");
    try {
      const result = await onEditNote(noteDraft);
      if (result === false || result?.ok === false) {
        setNoteEditError(result?.message || "Could not save this comment. Please try again.");
        return;
      }

      const nextNote = normalizeMovieNote(result?.movie?.note ?? noteDraft);
      setDisplayedNote(nextNote);
      setNoteDraft(nextNote || "");
      setIsEditingNote(false);
    } catch (error) {
      console.error("[AddMovieModal] Failed to save movie comment", error);
      setNoteEditError("Could not save this comment. Please try again.");
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div className="modal-surface max-h-[92vh] max-w-4xl overflow-y-auto p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="movie-detail-title">
        <button
          onClick={onClose}
          className="icon-btn absolute top-4 right-4"
          aria-label="Close"
        >
          ✕
        </button>

        {posterUrl && (
          <div className="mx-auto mb-5 max-h-[46vh] max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-full max-h-[46vh] w-full object-contain"
            />
          </div>
        )}

        <div className="mb-1 flex items-center gap-2">
          <h2 id="movie-detail-title" className="pr-10 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
            {movie.title} ({year})
          </h2>
          {isCustomEntry && (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-xs font-semibold text-amber-300">
              Custom
            </span>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {Number(movie.runtime) > 0 && (
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

        {(displayedNote || onEditNote) && (
          <div className="mb-4">
            {(displayedNote || isEditingNote) && (
              <p className="mb-1 text-sm font-semibold text-slate-100">
                {resolvedNoteHeading}
              </p>
            )}
            {isEditingNote ? (
              <div>
                <textarea
                  className="input-field min-h-28 resize-y whitespace-pre-wrap"
                  value={noteDraft}
                  maxLength={MAX_MOVIE_NOTE_LENGTH}
                  placeholder="Recommended by Tim at dinner…"
                  onChange={(event) => setNoteDraft(event.target.value)}
                  disabled={isSavingNote}
                  aria-label="Comment (optional)"
                />
                <div className="mt-1 flex items-start justify-between gap-3 text-xs text-slate-400">
                  <span>{noteEditError || "Add a reminder of why this movie belongs in the bowl."}</span>
                  <span className="shrink-0">{noteDraft.length}/{MAX_MOVIE_NOTE_LENGTH}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary px-3 py-1.5 text-sm"
                    onClick={saveNote}
                    disabled={isSavingNote}
                  >
                    {isSavingNote ? "Saving..." : "Save Comment"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary px-3 py-1.5 text-sm"
                    onClick={() => {
                      setNoteDraft(displayedNote || "");
                      setNoteEditError("");
                      setIsEditingNote(false);
                    }}
                    disabled={isSavingNote}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {displayedNote && (
                  <p className="whitespace-pre-wrap text-sm text-slate-300">{displayedNote}</p>
                )}
                {onEditNote && (
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-rose-300 hover:text-rose-200"
                    onClick={() => {
                      setNoteDraft(displayedNote || "");
                      setNoteEditError("");
                      setIsEditingNote(true);
                    }}
                  >
                    Edit Comment
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {hasTrailer && <TrailerDisclosure key={trailerRegionId} movie={movie} trailerRegionId={trailerRegionId} />}

        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-slate-100">Available on</p>
          {availableProviders.length > 0 ? (
            <p className="text-sm text-slate-300">{availableProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-400">No US streaming providers found right now.</p>
          )}
        </div>

        <div className="mb-5">
          <p className="mb-1 text-sm font-semibold text-slate-100">Your services</p>
          {matchingProviders.length > 0 ? (
            <p className="text-sm text-emerald-300">{matchingProviders.join(", ")}</p>
          ) : (
            <p className="text-sm text-slate-400">None of your saved services match this title.</p>
          )}
        </div>

        {webLaunchCandidate && (
          <div className="mb-5 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
            <p className="mb-1 text-sm font-semibold text-slate-100">Open to watch</p>
            <div className="mt-2">
              <p className="mb-2 text-sm text-slate-400">
                Web launch match: {webLaunchCandidate.serviceName}.
              </p>
              {/* A secure window.open returns null even when it succeeds.
                  Let the browser follow the link without guessing its result. */}
              <a
                href={webLaunchCandidate.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                {`Open on Web in ${webLaunchCandidate.serviceName}`}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {webLaunchCandidate.linkType === "title" && (
                <div className="mt-2"><ProviderLinksAttribution /></div>
              )}
            </div>
          </div>
        )}

        {detailPrimaryActionError && (
          <div
            className="mb-3 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-sm text-rose-300"
            role="alert"
          >
            {detailPrimaryActionError}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {onDetailPrimaryAction && detailPrimaryActionLabel && (
            <button
              onClick={async () => {
                await onDetailPrimaryAction(movie);
              }}
              className="btn btn-secondary"
              disabled={isDetailPrimaryActionLoading}
            >
              {isDetailPrimaryActionLoading ? "Adding..." : detailPrimaryActionLabel}
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

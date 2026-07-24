import { useMemo, useState } from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { formatLocalCalendarDate } from "../utils/letterboxdExport";

function getToday() {
  return formatLocalCalendarDate(new Date());
}

function normalizeDateInput(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export default function WatchHistoryEntryModal({
  entry = null,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
  errorMessage = "",
}) {
  const [selectedMovie, setSelectedMovie] = useState(entry);
  const [title, setTitle] = useState(entry?.title || "");
  const [watchedOn, setWatchedOn] = useState(normalizeDateInput(entry?.watched_on) || getToday());
  const [releaseDate, setReleaseDate] = useState(normalizeDateInput(entry?.release_date));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isEditing = Boolean(entry?.id);
  const posterUrl = useMemo(
    () => (selectedMovie ? getPosterUrl(selectedMovie, "w200") : null),
    [selectedMovie]
  );

  const chooseMovie = async (movie) => {
    setSelectedMovie(movie);
    setTitle(movie?.title || "");
    setReleaseDate(normalizeDateInput(movie?.release_date));
    return { ok: true };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedMovie || isSaving) return;

    await onSave?.({
      ...selectedMovie,
      title: title.trim(),
      watched_on: watchedOn,
      release_date: releaseDate || null,
    });
  };

  return (
    <div className="modal-overlay z-[70]" role="presentation">
      <div
        className="modal-surface max-h-[92vh] max-w-2xl overflow-y-auto p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-history-entry-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="icon-btn absolute right-4 top-4"
          aria-label="Close"
          disabled={isSaving}
        >
          ✕
        </button>

        <h2 id="watch-history-entry-title" className="pr-12 text-2xl font-semibold tracking-tight text-slate-100">
          {isEditing ? "Edit watch history" : "Add to watch history"}
        </h2>

        {!selectedMovie ? (
          <>
            <p className="mt-2 text-sm text-slate-400">
              Search for a movie, or add a custom title you watched.
            </p>
            <MovieSearch onAddMovie={chooseMovie} />
          </>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/45 p-3">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt=""
                  className="h-20 w-14 rounded-lg object-cover shadow-md shadow-black/30"
                />
              ) : (
                <div className="flex h-20 w-14 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 p-1 text-center text-[10px] font-semibold text-slate-300">
                  {selectedMovie.title}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-100">{selectedMovie.title}</p>
                {!isEditing && (
                  <button
                    type="button"
                    className="mt-1 text-sm font-medium text-rose-300 hover:text-rose-200"
                    onClick={() => setSelectedMovie(null)}
                    disabled={isSaving}
                  >
                    Choose a different movie
                  </button>
                )}
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-300">
              Title
              <input
                className="input-field mt-1.5"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                disabled={isSaving}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-300">
                Watched on
                <input
                  type="date"
                  className="input-field mt-1.5"
                  value={watchedOn}
                  onChange={(event) => setWatchedOn(event.target.value)}
                  required
                  disabled={isSaving}
                />
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Release date
                <input
                  type="date"
                  className="input-field mt-1.5"
                  value={releaseDate}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  disabled={isSaving}
                />
              </label>
            </div>

            {errorMessage && (
              <div className="status-error" role="alert">
                {errorMessage}
              </div>
            )}

            {isEditing && confirmingDelete ? (
              <div className="rounded-xl border border-rose-900/60 bg-rose-950/40 p-3">
                <p className="text-sm text-rose-100">Remove this watch history entry?</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={isSaving}
                  >
                    Keep entry
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onDelete?.(entry)}
                    disabled={isSaving}
                  >
                    Remove entry
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {isEditing ? (
                  <button
                    type="button"
                    className="btn btn-ghost px-3 py-2 text-sm text-rose-300 hover:text-rose-200"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={isSaving}
                  >
                    Remove from history
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving..." : isEditing ? "Save changes" : "Add to history"}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

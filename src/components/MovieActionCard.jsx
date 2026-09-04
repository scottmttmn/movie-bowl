import MoviePosterPin from "./MoviePosterPin";

// Sized and shaped to match WatchedMovieCard on purpose. The two strips sit on
// the same screen, and a card that is 40% taller than its neighbour reads as a
// different kind of thing rather than the same movie in a different state. The
// height went into a row of labelled buttons, so the actions moved onto the
// poster instead -- where the pin control already lived.
export default function MovieActionCard({
  movie,
  dateLabelPrefix,
  dateValue,
  onViewDetails,
  onDelete,
  disableWhileSyncing = true,
  isFilterExcluded = false,
  isPinned = false,
  onTogglePin,
  pinDisabled = false,
}) {
  const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString() : null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || movie.tmdb_id == null || Number(movie.tmdb_id) <= 0
  );
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
    : movie.poster || null;
  const isSyncing = movie.local_status === "syncing";
  const disableActions = disableWhileSyncing && isSyncing;
  const showPinControl = typeof onTogglePin === "function";
  const pinControlDisabled = pinDisabled || isSyncing;
  const pinLabel = isPinned
    ? `Unpin "${movie.title}"`
    : `Pin "${movie.title}" so it comes up first when you're picked`;
  const dimmed = isFilterExcluded ? "opacity-45 grayscale" : "";

  return (
    <article
      className="poster-card relative inline-flex w-28 flex-shrink-0 flex-col text-center"
      data-filter-excluded={isFilterExcluded ? "true" : undefined}
    >
      {/* The poster is the way in, exactly as it is in the watched strip, so the
          two sections stop being different interactions as well as sizes. */}
      <button
        type="button"
        onClick={() => onViewDetails?.(movie)}
        disabled={disableActions}
        aria-label={`Details for ${movie.title}`}
        className={`group w-full rounded-xl border-0 bg-transparent p-0 transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/70 disabled:translate-y-0 ${
          isSyncing ? "opacity-80" : ""
        }`}
      >
        <div className={dimmed}>
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-40 w-28 rounded-xl border-2 border-transparent object-cover shadow-lg shadow-black/30 transition group-hover:shadow-xl group-hover:shadow-black/40"
            />
          ) : (
            <div className="flex h-40 w-28 items-center justify-center rounded-xl border-2 border-slate-700 bg-slate-800 p-2">
              <p className="text-center text-xs font-semibold text-slate-200">{movie.title}</p>
            </div>
          )}
        </div>
      </button>

      {/* Siblings of the poster button rather than children of it: an
          interactive element inside another one is neither valid nor reachable. */}
      <MoviePosterPin
        isPinned={isPinned}
        label={pinLabel}
        disabled={pinControlDisabled}
        onClick={showPinControl ? () => onTogglePin(movie, !isPinned) : undefined}
      />
      {typeof onDelete === "function" && (
        <button
          type="button"
          onClick={() => onDelete(movie)}
          disabled={disableActions}
          aria-label={`Delete "${movie.title}" from this bowl`}
          title={`Delete "${movie.title}" from this bowl`}
          className="poster-action icon-btn absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-800/80 bg-slate-950/90 text-rose-300 shadow-lg shadow-black/40 hover:border-rose-600 hover:text-rose-200"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16" />
            <path d="M10 11v6M14 11v6" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
            <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      )}

      <div className={dimmed}>
        <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs font-medium leading-tight text-slate-200">
          {movie.title}
        </p>
        {isCustomEntry && (
          <span className="inline-flex rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            Custom
          </span>
        )}
        {dateLabel && dateLabelPrefix && (
          <p className="text-[11px] text-slate-400">
            {dateLabelPrefix}: {dateLabel}
          </p>
        )}
        {isFilterExcluded && <span className="sr-only">Outside current filters</span>}
      </div>
      {isSyncing && <p className="text-[11px] font-medium text-rose-300">Syncing...</p>}
    </article>
  );
}

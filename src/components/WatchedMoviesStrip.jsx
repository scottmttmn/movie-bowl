import { useId } from "react";
import WatchedMovieCard from "./WatchedMovieCard";
import MovieStripSkeleton from "./MovieStripSkeleton";

export default function WatchedMoviesStrip({
  movies = [],
  onSelectMovie,
  isExpanded = true,
  isLoading = false,
  // What the count read last time, shown while loading instead of a zero that
  // only means "not loaded yet". Null shows no count until the rows arrive.
  heldCount = null,
  onToggleExpanded,
}) {
  const isEmpty = !isLoading && movies.length === 0;
  // Empty is shown by the empty card, so it carries no "0 watched" either.
  const watchedCount = isLoading ? heldCount : isEmpty ? null : movies.length;
  const watchedCountLabel = typeof watchedCount !== "number"
    ? ""
    : watchedCount === 1 ? "1 watched" : `${watchedCount} watched`;
  const listId = useId();
  const isCollapsible = typeof onToggleExpanded === "function";

  return (
    <section className="watched-movies-strip mt-1 w-full min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="section-title text-base">Watched</h3>
          <span className="text-xs font-semibold text-slate-400">{watchedCountLabel}</span>
        </div>
        {isEmpty ? null : isCollapsible ? (
          <button
            type="button"
            className="btn btn-ghost px-3 py-2 text-sm"
            aria-expanded={isExpanded}
            aria-controls={listId}
            onClick={onToggleExpanded}
          >
            {isExpanded ? "Hide" : "Show"}
          </button>
        ) : (
          <p className="text-xs text-slate-400">Tap a poster for details</p>
        )}
      </div>
      {/* An empty list while the bowl is still loading is indistinguishable
          from a bowl nobody has watched from, and it collapses to nothing --
          so the cards arriving push everything below them down. */}
      {isExpanded && isLoading && (
        <div className="pb-3 pt-1">
          <MovieStripSkeleton count={3} label="Loading watched movies…" />
        </div>
      )}
      {isEmpty && (
        <div className="pb-3 pt-1">
          <div className="watched-empty" role="img" aria-label="Nothing watched yet">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M9 6v12" strokeDasharray="2 2" /></svg>
          </div>
        </div>
      )}
      {isExpanded && !isLoading && !isEmpty && (
        <div id={listId} className="flex flex-nowrap gap-3 overflow-x-auto pb-3 pt-1">
          {movies.map((movie) => (
            <WatchedMovieCard
              key={movie.id}
              movie={movie}
              onClick={onSelectMovie}
            />
          ))}
        </div>
      )}
    </section>
  );
}

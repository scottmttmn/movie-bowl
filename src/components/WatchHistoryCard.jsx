import MovieThumbs from "./MovieThumbs";

// One movie on the Watch History calendar. The title is the card's button,
// stretched over the whole card, so the thumbs below it can be buttons of
// their own rather than buttons inside a button.
export default function WatchHistoryCard({ movie, rating = null, canRate = false, onOpen, onRate }) {
  return (
    <div className="group relative flex w-full items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-black/20">
      <img
        src={movie.posterUrl}
        alt=""
        className="h-24 w-16 flex-shrink-0 rounded-xl object-cover shadow-md shadow-black/30"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-lg font-semibold text-slate-100">
            <button
              type="button"
              onClick={onOpen}
              className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-rose-800/60"
            >
              {movie.title}
            </button>
          </h3>
          <span className="text-sm text-slate-400">
            ({movie.releaseYear})
          </span>
        </div>
        <p className={`${canRate ? "mt-1" : "mt-2"} flex flex-wrap items-center gap-2 text-sm text-slate-300`}>
          {movie.bowlName ? `From ${movie.bowlName}` : "Added manually"}
          {movie.source_kind === "solo_draw" && (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
              Solo
            </span>
          )}
        </p>
        {movie.watchedDateLabel && (
          <p className={`${canRate ? "mt-0.5" : "mt-1"} text-sm text-slate-400`}>
            Watched on {movie.watchedDateLabel}
          </p>
        )}
        {/* Quiet until used, so the unrated cards are the catch-up list. */}
        {canRate && (
          <div className="-ml-1 mt-1.5">
            <MovieThumbs
              title={movie.title}
              value={rating}
              onChange={(next) => onRate?.(movie, next)}
              size="sm"
              quiet
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchedMovieCard({ movie, onClick }) {
  const drawnDate = movie.drawn_at || movie.drawnAt;
  const drawnDateLabel = drawnDate ? new Date(drawnDate).toLocaleDateString() : null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || movie.tmdb_id == null || Number(movie.tmdb_id) <= 0
  );
  

  return (
    <div className="watched-movie-card inline-flex w-28 flex-shrink-0 flex-col items-center text-center">
      <button
        type="button"
        onClick={() => onClick?.(movie)}
        className="group w-full rounded-xl border-0 bg-transparent p-0 transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/70"
      >
        {(() => {
          const posterUrl = movie.poster_path
            ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
            : movie.poster || null;

          return posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-40 w-28 rounded-xl object-cover shadow-lg shadow-black/30 transition group-hover:shadow-xl group-hover:shadow-black/40"
            />
          ) : (
            <div className="flex h-40 w-28 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 p-2">
              <p className="text-center text-xs font-semibold text-slate-200">{movie.title}</p>
            </div>
          );
        })()}
      </button>
      <p className="mt-1 min-h-[2rem] overflow-hidden text-xs font-medium leading-tight text-slate-200">
        {movie.title}
      </p>
      {isCustomEntry && (
        <span className="rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          Custom
        </span>
      )}
      {drawnDateLabel && <p className="text-[11px] text-slate-400">{drawnDateLabel}</p>}
    </div>
  );
}

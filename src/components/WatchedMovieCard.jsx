export default function WatchedMovieCard({ movie, onClick }) {
  const drawnDate = movie.drawn_at || movie.drawnAt;
  const drawnDateLabel = drawnDate ? new Date(drawnDate).toLocaleDateString() : null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || movie.tmdb_id == null || Number(movie.tmdb_id) <= 0
  );
  

  return (
    <div className="watched-movie-card flex-shrink-0 inline-flex w-28 flex-col items-center text-center">
      <button
        type="button"
        onClick={() => onClick?.(movie)}
        className="w-full rounded-lg border-0 bg-transparent p-0 transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-900/70"
      >
        {(() => {
          const posterUrl = movie.poster_path
            ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
            : movie.poster || null;

          return posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="w-28 h-40 object-cover rounded-lg shadow-sm"
            />
          ) : (
            <div className="flex h-40 w-28 items-center justify-center rounded-lg bg-slate-800 p-2">
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
      {drawnDateLabel && <p className="text-[11px] text-slate-500">{drawnDateLabel}</p>}
    </div>
  );
}

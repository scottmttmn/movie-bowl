export default function WatchedMovieCard({ movie, onClick }) {
  const drawnDate = movie.drawn_at || movie.drawnAt;
  const drawnDateLabel = drawnDate ? new Date(drawnDate).toLocaleDateString() : null;
  

  return (
    <button
      type="button"
      onClick={() => onClick?.(movie)}
      className="watched-movie-card flex-shrink-0 inline-flex flex-col items-center w-28 text-center bg-transparent border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 rounded-lg transition hover:opacity-95"
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
          <div className="w-28 h-40 flex items-center justify-center rounded-lg bg-slate-200 p-2">
            <p className="text-xs font-semibold text-center">{movie.title}</p>
          </div>
        );
      })()}
      
      <p className="mt-1 text-xs font-medium text-slate-700 leading-tight min-h-[2rem] overflow-hidden">
        {movie.title}
      </p>
      {drawnDateLabel && <p className="text-[11px] text-slate-500">{drawnDateLabel}</p>}
    </button>
  );
}

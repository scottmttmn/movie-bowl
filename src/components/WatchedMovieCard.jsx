import { getMovieAttributionAccent, getMovieAttributionLabel } from "../utils/drawBuckets";

export default function WatchedMovieCard({ movie, onClick }) {
  const drawnDate = movie.drawn_at || movie.drawnAt;
  const dateOnly = String(drawnDate || "").match(/^\d{4}-\d{2}-\d{2}$/);
  const displayDate = dateOnly ? new Date(`${dateOnly[0]}T12:00:00`) : new Date(drawnDate);
  const drawnDateLabel = drawnDate && !Number.isNaN(displayDate.getTime())
    ? displayDate.toLocaleDateString()
    : null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || movie.tmdb_id == null || Number(movie.tmdb_id) <= 0
  );
  const addedByLabel = getMovieAttributionLabel(movie);
  const contributorAccent = addedByLabel ? getMovieAttributionAccent(movie) : null;
  const contributorInitial = addedByLabel?.trim().charAt(0).toUpperCase();

  return (
    <div className="watched-movie-card inline-flex w-28 flex-shrink-0 flex-col items-center text-center">
      <button
        type="button"
        onClick={() => onClick?.(movie)}
        className="group w-full rounded-xl border-0 bg-transparent p-0 transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/70"
      >
        <div className="relative">
          {(() => {
          const posterUrl = movie.poster_path
            ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
            : movie.poster || null;

          return posterUrl ? (
            <img
              src={posterUrl}
              alt={movie.title}
              className="h-40 w-28 rounded-xl border-2 object-cover shadow-lg shadow-black/30 transition group-hover:shadow-xl group-hover:shadow-black/40"
              style={{ borderColor: contributorAccent?.borderColor || "transparent" }}
            />
          ) : (
            <div
              className="flex h-40 w-28 items-center justify-center rounded-xl border-2 bg-slate-800 p-2"
              style={{ borderColor: contributorAccent?.borderColor || "#334155" }}
            >
              <p className="text-center text-xs font-semibold text-slate-200">{movie.title}</p>
            </div>
          );
          })()}
          {contributorInitial && (
            <span
              role="img"
              aria-label={`Added by ${addedByLabel}`}
              title={`Added by ${addedByLabel}`}
              className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/30 text-xs font-bold text-white shadow-md"
              style={{ backgroundColor: contributorAccent.avatarColor }}
            >
              {contributorInitial}
            </span>
          )}
        </div>
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

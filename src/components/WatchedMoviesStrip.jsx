import WatchedMovieCard from "./WatchedMovieCard";

export default function WatchedMoviesStrip({ movies = [], onSelectMovie }) {
  const watchedCount = movies.length;
  const watchedCountLabel = watchedCount === 1 ? "1 watched" : `${watchedCount} watched`;

  return (
    <section className="watched-movies-strip mt-1 w-full min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="section-title text-base">Watched</h3>
          <span className="text-xs font-semibold text-slate-400">{watchedCountLabel}</span>
        </div>
        <p className="text-xs text-slate-400">Tap a poster for details</p>
      </div>
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-3 pt-1">
        {movies.map((movie) => (
          <WatchedMovieCard
            key={movie.id}
            movie={movie}
            onClick={onSelectMovie}
          />
        ))}
      </div>
    </section>
  );
}

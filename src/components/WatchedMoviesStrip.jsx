import WatchedMovieCard from "./WatchedMovieCard";

export default function WatchedMoviesStrip({ movies, onSelectMovie }) {
  return (
    <section className="watched-movies-strip w-full min-w-0 mt-1">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-title text-base">Watched</h3>
        <p className="text-xs text-slate-500">Tap a poster for details</p>
      </div>
      <div className="flex flex-nowrap overflow-x-auto gap-3 pb-1">
        {movies.map((movie) => (
          <WatchedMovieCard key={movie.id} movie={movie} onClick={onSelectMovie} />
        ))}
      </div>
    </section>
  );
}

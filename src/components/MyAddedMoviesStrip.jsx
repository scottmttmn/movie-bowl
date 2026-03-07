import MovieActionCard from "./MovieActionCard";

export default function MyAddedMoviesStrip({ movies, onViewMovie, onDeleteMovie }) {
  return (
    <section className="my-added-movies-strip w-full min-w-0 mt-1">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-title text-base">My Adds</h3>
        <p className="text-xs text-slate-500">Only your undrawn movies</p>
      </div>
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {movies.map((movie) => (
          <MovieActionCard
            key={movie.id}
            movie={movie}
            dateLabelPrefix="Added"
            dateValue={movie.added_at}
            primaryActionLabel="Details"
            secondaryActionLabel="Delete"
            onPrimaryAction={onViewMovie}
            onSecondaryAction={onDeleteMovie}
          />
        ))}
      </div>
    </section>
  );
}

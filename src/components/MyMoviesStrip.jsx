import MovieActionCard from "./MovieActionCard";

export default function MyMoviesStrip({ movies, onViewMovie, onDeleteMovie }) {
  return (
    <section className="my-movies-strip w-full min-w-0 mt-1">
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {movies.map((movie) => (
          <MovieActionCard
            key={`${movie.source}:${movie.id}`}
            movie={movie}
            dateLabelPrefix="Added"
            dateValue={movie.added_at}
            primaryActionLabel="Details"
            secondaryActionLabel="Delete"
            onPrimaryAction={onViewMovie}
            onSecondaryAction={onDeleteMovie}
            disableWhileSyncing
          />
        ))}
      </div>
    </section>
  );
}

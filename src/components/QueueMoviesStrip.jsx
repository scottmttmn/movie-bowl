import MovieActionCard from "./MovieActionCard";

export default function QueueMoviesStrip({ movies, onViewMovie, onRemoveMovie }) {
  return (
    <section className="my-queue-movies-strip w-full min-w-0 mt-1">
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {movies.map((movie) => (
          <MovieActionCard
            key={movie.id}
            movie={movie}
            dateLabelPrefix="Queued"
            dateValue={movie.queued_at}
            primaryActionLabel="Details"
            secondaryActionLabel="Remove"
            onPrimaryAction={onViewMovie}
            onSecondaryAction={onRemoveMovie}
            disableWhileSyncing={false}
          />
        ))}
      </div>
    </section>
  );
}

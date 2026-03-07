import MovieActionCard from "./MovieActionCard";

export default function MyMoviesStrip({ movies, onViewMovie, onDeleteMovie }) {
  return (
    <section className="my-movies-strip w-full min-w-0 mt-1">
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {movies.map((movie) => (
          <MovieActionCard
            key={`${movie.source}:${movie.id}`}
            movie={movie}
            dateLabelPrefix={movie.source === "queue" ? "Queued" : "Added"}
            dateValue={movie.source === "queue" ? movie.queued_at : movie.added_at}
            variant={movie.source === "queue" ? "queued" : "default"}
            primaryActionLabel="Details"
            secondaryActionLabel="Delete"
            onPrimaryAction={onViewMovie}
            onSecondaryAction={onDeleteMovie}
            disableWhileSyncing={movie.source !== "queue"}
          />
        ))}
      </div>
    </section>
  );
}

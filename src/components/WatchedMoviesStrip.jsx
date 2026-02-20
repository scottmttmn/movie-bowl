import WatchedMovieCard from "./WatchedMovieCard";

export default function WatchedMoviesStrip({ movies }) {
  return (
    <div className="watched-movies-strip w-full min-w-0 flex flex-nowrap overflow-x-auto py-2 space-x-2 border-t border-b mt-4">
      {movies.map((movie) => (
        <WatchedMovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
import WatchedMovieCard from "./WatchedMovieCard";

export default function WatchedMoviesStrip({ movies }) {
  return (
    <div className="watched-movies-strip flex overflow-x-auto py-2 space-x-2 border-t border-b mt-4">
      {movies.map((movie) => (
        <WatchedMovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  );
}
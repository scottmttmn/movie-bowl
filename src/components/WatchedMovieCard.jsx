export default function WatchedMovieCard({ movie }) {
    return (
      <div className="watched-movie-card flex-shrink-0 w-24 text-center">
        <img src={movie.poster} alt={movie.title} className="w-24 h-36 object-cover rounded" />
        <p className="text-xs mt-1 truncate">{movie.title}</p>
      </div>
    );
  }
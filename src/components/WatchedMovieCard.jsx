export default function WatchedMovieCard({ movie }) {
  const drawnDate = movie.drawnAt ? new Date(movie.drawnAt).toLocaleDateString() : null;

  return (
    <div className="watched-movie-card flex-shrink-0 inline-flex w-24 text-center">
      <img src={movie.poster} alt={movie.title} className="w-24 h-36 object-cover rounded" />
      <p className="text-xs mt-1 truncate font-semibold">{movie.title}</p>
      {drawnDate && <p className="text-[10px] text-gray-500">{drawnDate}</p>}
    </div>
  );
}
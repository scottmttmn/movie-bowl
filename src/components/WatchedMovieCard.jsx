export default function WatchedMovieCard({ movie }) {
  const drawnDate = movie.drawnAt ? new Date(movie.drawnAt).toLocaleDateString() : null;

  return (
    <div className="watched-movie-card flex-shrink-0 inline-flex flex-col items-center w-24 text-center">
      {movie.poster ? (
        <img
          src={movie.poster}
          alt={movie.title}
          className="w-24 h-36 object-cover rounded"
        />
      ) : (
        <div className="w-24 h-36 flex items-center justify-center rounded bg-gray-200 p-2">
          <p className="text-xs font-semibold text-center">{movie.title}</p>
        </div>
      )}
      
      {drawnDate && <p className="text-[10px] text-gray-500 mt-1">{drawnDate}</p>}
    </div>
  );
}
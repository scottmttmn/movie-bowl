function MyAddedMovieCard({ movie, onViewMovie, onDeleteMovie }) {
  const addedAtLabel = movie.added_at ? new Date(movie.added_at).toLocaleDateString() : null;
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
    : movie.poster || null;

  return (
    <article className="w-32 flex-shrink-0 rounded-lg border border-slate-200 bg-white p-2">
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={movie.title}
          className="h-40 w-full rounded-md object-cover"
        />
      ) : (
        <div className="h-40 w-full rounded-md bg-slate-200 p-2 flex items-center justify-center">
          <p className="text-xs text-center font-semibold text-slate-700">{movie.title}</p>
        </div>
      )}
      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs font-semibold text-slate-800">
        {movie.title}
      </p>
      {addedAtLabel && <p className="mb-2 text-[11px] text-slate-500">Added: {addedAtLabel}</p>}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onViewMovie?.(movie)}
          className="btn btn-secondary px-2 py-1 text-xs"
        >
          Details
        </button>
        <button
          type="button"
          onClick={() => onDeleteMovie?.(movie)}
          className="btn border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export default function MyAddedMoviesStrip({ movies, onViewMovie, onDeleteMovie }) {
  return (
    <section className="my-added-movies-strip w-full min-w-0 mt-1">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-title text-base">My Adds</h3>
        <p className="text-xs text-slate-500">Only your undrawn movies</p>
      </div>
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-1">
        {movies.map((movie) => (
          <MyAddedMovieCard
            key={movie.id}
            movie={movie}
            onViewMovie={onViewMovie}
            onDeleteMovie={onDeleteMovie}
          />
        ))}
      </div>
    </section>
  );
}

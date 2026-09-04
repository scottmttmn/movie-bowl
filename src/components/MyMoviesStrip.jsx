import MovieActionCard from "./MovieActionCard";
import { MY_MOVIE_ELIGIBILITY_STATUS } from "../hooks/useMyMovieEligibility";
import { DEFAULT_DRAW_METHOD, getDrawMethod } from "../utils/drawMethods";

export default function MyMoviesStrip({
  movies,
  onViewMovie,
  eligibilityStatus = MY_MOVIE_ELIGIBILITY_STATUS.idle,
  eligibleMovieIds = [],
  onRunEligibilityLookups,
  drawMethod = DEFAULT_DRAW_METHOD,
  onTogglePin,
}) {
  const hasResolvedEligibility = eligibilityStatus === MY_MOVIE_ELIGIBILITY_STATUS.ready;
  const eligibleIdSet = new Set((eligibleMovieIds || []).map((id) => String(id)));
  const method = getDrawMethod(drawMethod);
  const persistedMovies = movies.filter((movie) => movie.local_status !== "syncing");
  const syncingMovies = movies.filter((movie) => movie.local_status === "syncing");
  const orderedMovies = hasResolvedEligibility
    ? [
        ...persistedMovies.filter(
          (movie) => movie.is_pinned && eligibleIdSet.has(String(movie.id))
        ),
        ...persistedMovies.filter(
          (movie) => !movie.is_pinned && eligibleIdSet.has(String(movie.id))
        ),
        ...persistedMovies.filter((movie) => !eligibleIdSet.has(String(movie.id))),
        ...syncingMovies,
      ]
    : [
        ...persistedMovies.filter((movie) => movie.is_pinned),
        ...persistedMovies.filter((movie) => !movie.is_pinned),
        ...syncingMovies,
      ];

  return (
    <section className="my-movies-strip mt-1 w-full min-w-0">
      {method.pinNote && (
        <p className="mb-3 text-xs text-slate-400">{method.pinNote}</p>
      )}
      {eligibilityStatus === MY_MOVIE_ELIGIBILITY_STATUS.manual && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
          <p className="text-xs text-slate-300">Check more than 100 movies against the current filters.</p>
          <button
            type="button"
            className="text-sm font-medium text-rose-300 hover:text-rose-200"
            onClick={onRunEligibilityLookups}
          >
            Check filter matches
          </button>
        </div>
      )}
      {eligibilityStatus === MY_MOVIE_ELIGIBILITY_STATUS.checking && (
        <p className="mb-2 text-xs text-slate-400" role="status">
          Previewing filter matches…
        </p>
      )}
      <div className="flex flex-nowrap gap-3 overflow-x-auto pb-3 pt-1">
        {orderedMovies.map((movie) => {
          const isEligible = eligibleIdSet.has(String(movie.id));
          const isFilterExcluded =
            hasResolvedEligibility && movie.local_status !== "syncing" && !isEligible;

          return (
            <MovieActionCard
              key={`${movie.source}:${movie.id}`}
              movie={movie}
              dateLabelPrefix="Added"
              dateValue={movie.added_at}
              onViewDetails={onViewMovie}
              disableWhileSyncing
              isFilterExcluded={isFilterExcluded}
              isPinned={Boolean(movie.is_pinned)}
              onTogglePin={method.honorsPin && !isFilterExcluded ? onTogglePin : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

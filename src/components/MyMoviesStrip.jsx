import MovieActionCard from "./MovieActionCard";
import { MY_MOVIE_ELIGIBILITY_STATUS } from "../hooks/useMyMovieEligibility";

export default function MyMoviesStrip({
  movies,
  onViewMovie,
  onDeleteMovie,
  eligibilityStatus = MY_MOVIE_ELIGIBILITY_STATUS.idle,
  eligibleMovieIds = [],
  onRunEligibilityLookups,
}) {
  const hasResolvedEligibility = eligibilityStatus === MY_MOVIE_ELIGIBILITY_STATUS.ready;
  const eligibleIdSet = new Set((eligibleMovieIds || []).map((id) => String(id)));
  const orderedMovies = hasResolvedEligibility
    ? [
        ...movies.filter(
          (movie) => movie.local_status !== "syncing" && eligibleIdSet.has(String(movie.id))
        ),
        ...movies.filter(
          (movie) => movie.local_status !== "syncing" && !eligibleIdSet.has(String(movie.id))
        ),
        ...movies.filter((movie) => movie.local_status === "syncing"),
      ]
    : movies;

  return (
    <section className="my-movies-strip mt-1 w-full min-w-0">
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
        {orderedMovies.map((movie) => (
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
            isFilterExcluded={
              hasResolvedEligibility &&
              movie.local_status !== "syncing" &&
              !eligibleIdSet.has(String(movie.id))
            }
          />
        ))}
      </div>
    </section>
  );
}

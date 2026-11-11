// Months, then a day badge on a rail, then that day's movies. The page decides
// what a movie card holds and whether it does anything when tapped.
export default function WatchHistoryTimeline({ monthGroups, renderMovie }) {
  return (
    <div className="space-y-10">
      {monthGroups.map((monthGroup) => (
        <section key={monthGroup.key} aria-labelledby={`month-${monthGroup.key}`}>
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-slate-800 pb-3">
            <h2
              id={`month-${monthGroup.key}`}
              className="text-2xl font-semibold tracking-tight text-slate-100"
            >
              {monthGroup.label}
            </h2>
            <span className="text-sm font-semibold text-slate-400">
              {monthGroup.movieCount} {monthGroup.movieCount === 1 ? "movie" : "movies"}
            </span>
          </div>

          <div className="relative space-y-6 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-px before:bg-slate-800 sm:before:left-[3.7rem]">
            {monthGroup.dayGroups.map((dayGroup) => (
              <div
                key={dayGroup.key}
                className="relative grid gap-3 pl-14 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4 sm:pl-0"
              >
                <time
                  dateTime={dayGroup.dateTime}
                  className="absolute left-0 top-0 z-10 flex h-11 w-11 flex-col items-center justify-center rounded-xl border border-rose-900/70 bg-rose-950/70 text-center shadow-lg shadow-black/20 sm:static sm:h-auto sm:min-h-16 sm:w-full sm:flex-row sm:gap-2 sm:self-start sm:bg-slate-950/80"
                  aria-label={dayGroup.dayLabel}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 sm:text-xs">
                    {dayGroup.weekdayLabel}
                  </span>
                  <span className="text-base font-bold leading-none text-slate-50 sm:text-xl">
                    {dayGroup.dayNumber}
                  </span>
                </time>

                <div className="space-y-3">
                  <p className="sr-only">{dayGroup.dayLabel}</p>
                  {dayGroup.movies.map((movie) => renderMovie(movie))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

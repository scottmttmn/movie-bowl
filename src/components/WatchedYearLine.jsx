// "68 watched in 2026 ⌄ · 71 all time", read as one sentence. The year is the
// picker: the native select sits invisibly over the words, so a phone still
// opens its own wheel. With only one year there is nothing to pick, and the
// all-time count says nothing the year has not already said.
export default function WatchedYearLine({
  count,
  years = [],
  activeYear,
  onYearChange,
  allTimeCount = null,
  className = "",
  children = null,
}) {
  const showsAllTime = typeof allTimeCount === "number" && allTimeCount !== count;

  return (
    <p
      data-testid="watched-year-line"
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium text-slate-400 ${className}`}
    >
      <span>
        <span className="font-semibold text-slate-100">{count}</span> watched in
      </span>
      {years.length > 1 ? (
        <span className="year-pick">
          <span aria-hidden="true">{activeYear}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="year-pick-chevron" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          <select
            className="year-pick-select"
            aria-label="Year watched"
            value={activeYear}
            onChange={(event) => onYearChange(Number(event.target.value))}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </span>
      ) : (
        <span className="font-semibold text-slate-100">{activeYear}</span>
      )}
      {showsAllTime && (
        <span className="whitespace-nowrap">
          <span aria-hidden="true" className="mr-1.5 text-slate-600">·</span>
          <span className="font-semibold text-slate-300">{allTimeCount}</span> all time
        </span>
      )}
      {children}
    </p>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import WatchHistoryTimeline from "../components/WatchHistoryTimeline";
import { fetchSharedWatchHistory } from "../lib/watchHistoryShare";
import { getPosterUrl } from "../utils/getPosterUrl";
import {
  getWatchedDate,
  getWatchedYears,
  groupWatchHistoryByMonth,
} from "../utils/watchHistoryTimeline";

// What a Watch History link opens: the owner's calendar, read-only. It shows
// the title, year and day; never which bowl a movie came from or anyone else's
// reason for adding it, and the owner's own comments only when they chose to.
// There is nothing to tap, follow or answer -- see the share sheet for why.
export default function SharedWatchHistoryPage() {
  const { token } = useParams();
  const [history, setHistory] = useState({ status: "loading" });
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    let active = true;
    fetchSharedWatchHistory(token).then((result) => {
      if (active) setHistory(result);
    });
    return () => {
      active = false;
    };
  }, [token]);

  const rows = useMemo(
    () =>
      (history.entries || []).map((entry, index) => ({
        ...entry,
        key: `${entry.watched_on}-${index}`,
        watchedDate: getWatchedDate(entry.watched_on),
        releaseYear: entry.release_date ? String(entry.release_date).split("-")[0] : "—",
        posterUrl: getPosterUrl(entry, "w200"),
      })),
    [history.entries]
  );
  const years = useMemo(() => getWatchedYears(rows), [rows]);
  const activeYear = selectedYear !== null && years.includes(selectedYear) ? selectedYear : years[0] ?? null;
  const yearRows = useMemo(
    () => rows.filter((movie) => movie.watchedDate?.getFullYear() === activeYear),
    [rows, activeYear]
  );
  const monthGroups = useMemo(() => groupWatchHistoryByMonth(yearRows), [yearRows]);

  const heading = history.displayName ? `${history.displayName}’s movies` : "Watch History";

  return (
    <div className="page-container py-8 sm:py-12">
      {/* A link is meant for the people it was sent to, not for search. */}
      <meta name="robots" content="noindex, nofollow" />
      <main className="page-hero mx-auto max-w-5xl">
        <Link to="/about" className="eyebrow text-rose-300">Movie Bowl</Link>

        {history.status === "loading" ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : history.status === "off" ? (
          <p className="mt-4 text-lg font-medium text-slate-200">This link is off</p>
        ) : history.status === "error" ? (
          <div className="status-error mt-4">Could not load this page. Try again in a moment.</div>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{heading}</h1>
            {years.length > 0 ? (
              <p className="mt-3 mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-400">
                <span>{yearRows.length} watched in</span>
                <select
                  className="input-field min-h-0 w-auto py-1 pl-2.5 pr-8 text-sm font-semibold"
                  aria-label="Year watched"
                  value={activeYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </p>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Nothing watched yet.</p>
            )}

            <WatchHistoryTimeline
              monthGroups={monthGroups}
              renderMovie={(movie) => (
                <div
                  key={movie.key}
                  className="flex w-full items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/45 p-3"
                >
                  <img
                    src={movie.posterUrl}
                    alt=""
                    className="h-24 w-16 flex-shrink-0 rounded-xl object-cover shadow-md shadow-black/30"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="text-lg font-semibold text-slate-100">{movie.title}</h3>
                      <span className="text-sm text-slate-400">({movie.releaseYear})</span>
                    </div>
                    {history.includeComments && movie.personal_note && (
                      <p className="mt-2 border-l-2 border-rose-800/70 pl-2.5 text-sm italic leading-6 text-slate-300">
                        {movie.personal_note}
                      </p>
                    )}
                  </div>
                </div>
              )}
            />
          </>
        )}
      </main>
    </div>
  );
}

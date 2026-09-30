import { useEffect } from "react";
import useBowlServiceChart from "../hooks/useBowlServiceChart";
import AvailabilityAttribution from "./AvailabilityAttribution";
import ServiceLogo from "./ServiceLogo";

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// Bowl Settings' Streaming section: which paid services carry the movies left
// in this bowl, drawn from the viewer's side. It counts titles and never odds;
// see output/designs and the no-odds decision before adding anything that
// reads as a chance of being drawn.
export default function BowlServiceChart({ bowlId, onSummaryChange }) {
  const { status, chart, totalCount, uncheckedCount } = useBowlServiceChart(bowlId);
  const topRow = chart?.rows.find((row) => row.count > 0) || null;
  const barWidth = (count) => `${chart?.maxCount > 0 ? (count / chart.maxCount) * 100 : 0}%`;
  const isAllUnchecked = Boolean(chart) && totalCount > 0 && chart.titleCount === 0;
  // The nav tile keeps the page's placeholder until there is an answer.
  let summary = status === "error" ? "Unavailable" : "…";
  // Told from the viewer's side, like the headline: the tallest bar is often a
  // service they don't have, and naming it alone reads as if it were theirs.
  if (status === "ready") {
    if (isAllUnchecked) summary = "Not checked yet";
    else if (chart.hasServices && chart.titleCount > 0) {
      summary = `You can watch ${chart.coveredCount} of ${chart.titleCount}`;
    } else if (topRow) summary = `Most on ${topRow.service}`;
    else summary = "None on paid services";
  }

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

  let headline = null;
  if (chart?.bestAddition && chart.hasServices) {
    headline = (
      <>
        <strong className="font-semibold">{chart.bestAddition.service}</strong> has the most you can&apos;t watch
        yet: <strong className="font-semibold">{plural(chart.bestAddition.count, "movie", "movies")}</strong>.
      </>
    );
  } else if (chart?.bestAddition) {
    headline = (
      <>
        <strong className="font-semibold">{chart.bestAddition.service} carries the most</strong>:{" "}
        {chart.bestAddition.count} of these.
      </>
    );
  } else if (chart?.streamingCount > 0) {
    headline = "You can already watch everything here that's on a paid service.";
  }

  return (
    <section id="streaming" tabIndex={-1} className="panel scroll-mt-24" aria-labelledby="streaming-heading">
      <h2 id="streaming-heading" className="section-title">Streaming</h2>
      {status === "loading" && (
        <p className="mt-1 text-sm text-slate-400" role="status">Checking where these movies are streaming…</p>
      )}
      {status === "error" && (
        <p className="mt-1 text-sm text-slate-400">Streaming availability couldn&apos;t be loaded right now.</p>
      )}
      {chart && totalCount === 0 && (
        <p className="mt-1 text-sm text-slate-400">No movies left in this bowl to check yet.</p>
      )}
      {chart && totalCount > 0 && (
        <>
          <p className="mt-1 text-sm text-slate-400">
            How many of the {plural(totalCount, "movie", "movies")} left in this bowl each paid service carries.
          </p>
          {isAllUnchecked ? (
            <p className="mt-4 text-sm text-slate-300">
              Where these are streaming hasn&apos;t been checked yet.
            </p>
          ) : chart.rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">None of them are on a paid service right now.</p>
          ) : (
            <>
              {headline && (
                <p className="surface-card mt-4 px-4 py-3 text-sm text-slate-100">{headline}</p>
              )}
              {chart.hasServices && (
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300" aria-hidden="true">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-3.5 rounded-sm bg-emerald-400" />
                    You can watch
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-3.5 rounded-sm bg-slate-300" />
                    Can&apos;t watch yet
                  </span>
                </div>
              )}
              <ul className="mt-3 space-y-2.5" aria-label="Movies in this bowl by service">
                {chart.rows.map((row) => (
                  <li key={row.service} className="flex min-h-8 items-center gap-3">
                    <span className={`flex w-32 shrink-0 items-center gap-2 text-sm ${row.isMine ? "text-emerald-300" : "text-slate-300"}`}>
                      <ServiceLogo service={row.service} className="h-6 w-6" />
                      <span className="truncate">{row.service}</span>
                      {row.isMine && (
                        <>
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">(one of your services)</span>
                        </>
                      )}
                    </span>
                    {/* Green is what the viewer can watch, as on their own
                        services' labels; the plain part is what they can't yet. */}
                    <span
                      className={`flex h-4 flex-1 rounded ${row.isMine && row.count === 0 ? "bg-emerald-400/15" : ""}`}
                      aria-hidden="true"
                    >
                      {row.unwatchableCount > 0 && (
                        <span
                          className="block h-full rounded-l bg-slate-300 last:rounded-r"
                          style={{ width: barWidth(row.unwatchableCount) }}
                          data-testid="bar-unwatchable"
                        />
                      )}
                      {row.count > row.unwatchableCount && (
                        <span
                          className={`block h-full rounded-r first:rounded-l ${row.isMine ? "bg-emerald-400" : "bg-emerald-400/35"}`}
                          style={{ width: barWidth(row.count - row.unwatchableCount) }}
                          data-testid="bar-watchable"
                        />
                      )}
                    </span>
                    <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">
                      {row.count}
                      <span className="sr-only">
                        {" "}{row.count === 1 ? "movie" : "movies"}
                        {row.unwatchableCount > 0
                          ? `, ${row.unwatchableCount} you can't watch yet`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-xs text-slate-400">
            Counts movies, not chances of being drawn. Hand-added movies aren&apos;t counted
            {uncheckedCount > 0 ? `, and ${plural(uncheckedCount, "movie hasn't", "movies haven't")} been checked yet` : ""}.
          </p>
          <div className="mt-1"><AvailabilityAttribution /></div>
        </>
      )}
    </section>
  );
}

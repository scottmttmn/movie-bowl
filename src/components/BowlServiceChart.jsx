import { useEffect } from "react";
import useBowlServiceChart from "../hooks/useBowlServiceChart";
import AvailabilityAttribution from "./AvailabilityAttribution";
import ServiceLogo from "./ServiceLogo";

function formatServiceList(services) {
  if (services.length <= 1) return services[0] || "";
  return `${services.slice(0, -1).join(", ")} and ${services[services.length - 1]}`;
}

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
  const isAllUnchecked = Boolean(chart) && totalCount > 0 && chart.titleCount === 0;
  let summary = null;
  if (status === "ready") {
    if (topRow) summary = `${topRow.service} carries ${topRow.count}`;
    else if (isAllUnchecked) summary = "Not checked yet";
    else summary = "None on paid services";
  }

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [onSummaryChange, summary]);

  let headline = null;
  if (chart?.bestAddition && chart.hasServices) {
    headline = (
      <>
        <strong className="font-semibold">
          {chart.bestAddition.service} would add {plural(chart.bestAddition.count, "movie", "movies")}
        </strong>{" "}
        you can&apos;t stream on your services today.
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
    headline = "Your services already carry everything here that's on a paid service.";
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
              <ul className="mt-4 space-y-2.5" aria-label="Movies in this bowl by service">
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
                    <span
                      className={`h-4 flex-1 rounded ${row.isMine && row.count === 0 ? "bg-emerald-400/15" : ""}`}
                      aria-hidden="true"
                    >
                      <span
                        className={`block h-full rounded ${row.isMine ? "bg-emerald-400" : "bg-slate-400"}`}
                        style={{ width: `${chart.maxCount > 0 ? (row.count / chart.maxCount) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-100">
                      {row.count}
                      <span className="sr-only"> {row.count === 1 ? "movie" : "movies"}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {chart.idleServices.length > 0 && (
                <p className="mt-4 text-sm text-slate-400">
                  {formatServiceList(chart.idleServices)} {chart.idleServices.length === 1 ? "carries" : "carry"} nothing
                  here you can&apos;t already stream on your other services.
                </p>
              )}
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

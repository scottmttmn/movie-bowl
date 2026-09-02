import useBowlAdd from "../hooks/useBowlAdd";

// Two different things, deliberately separated. The result is feedback about
// the last submission and is always dismissible. An unconfirmed add outlives
// it: only a status check can settle one, so it keeps its own row until then.
export default function BowlAddStatusBanner() {
  const add = useBowlAdd();
  const result = add.result?.code === "outcome_unknown" ? null : add.result;
  if (!result && add.unresolved.length === 0) return null;
  return <div className="page-container pt-3 section-stack">
    {result && <div className={result.ok ? "status-success" : "status-error"} role={result.ok ? "status" : "alert"}>
      {result.ok
        ? `Added ${add.operation.movie.title} to ${add.operation.bowlName}`
        : `${add.operation.movie.title} — ${add.operation.bowlName}: ${result.message}`}
      {result.code === "add_not_committed" && <button className="btn btn-secondary ml-2" disabled={add.pending} onClick={add.retryAdd}>Try again</button>}
      <button className="icon-btn ml-2" aria-label="Dismiss add result" onClick={add.clearFeedback}>✕</button>
    </div>}
    {add.unresolved.map((entry) => <div key={entry.operation.submissionId} className="status-warning" role="alert">
      {entry.result.message}
      <button className="btn btn-secondary ml-2" disabled={add.pending}
        onClick={() => add.checkStatus(entry.operation.submissionId)}>Check add status</button>
    </div>)}
  </div>;
}

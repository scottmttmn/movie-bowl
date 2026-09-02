import useBowlAdd from "../hooks/useBowlAdd";
import { isUnsettledAddCode } from "../lib/addBowlMovie";

// Two different things, deliberately separated. The result is feedback about the
// last submission and is always dismissible. An add whose write may still land
// is not feedback: it keeps its own row, and its control resolves it, because
// dismissing it would free the same title to be submitted under a new id.
export default function BowlAddStatusBanner() {
  const add = useBowlAdd();
  const result = isUnsettledAddCode(add.result?.code) ? null : add.result;
  if (!result && add.unresolved.length === 0) return null;
  return <div className="page-container pt-3 section-stack">
    {result && <div className={result.ok ? "status-success" : "status-error"} role={result.ok ? "status" : "alert"}>
      {result.ok
        ? `Added ${add.operation.movie.title} to ${add.operation.bowlName}`
        : `${add.operation.movie.title} — ${add.operation.bowlName}: ${result.message}`}
      <button className="icon-btn ml-2" aria-label="Dismiss add result" onClick={add.clearFeedback}>✕</button>
    </div>}
    {add.unresolved.map((entry) => {
      const retryable = entry.result.code === "add_not_committed";
      return <div key={entry.operation.submissionId} className="status-warning" role="alert">
        {entry.result.message}
        <button className="btn btn-secondary ml-2" disabled={add.pending}
          onClick={() => (retryable ? add.retryAdd : add.checkStatus)(entry.operation.submissionId)}>
          {retryable ? "Try again" : "Check add status"}
        </button>
      </div>;
    })}
  </div>;
}

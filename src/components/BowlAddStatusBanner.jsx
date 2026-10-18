import useBowlAdd from "../hooks/useBowlAdd";
import { isUnsettledAddCode } from "../lib/addBowlMovie";

// Success is already confirmed in search. Keep only errors and unfinished adds
// here; an add whose write may still land must be resolved, since dismissing it
// would free the same title to be submitted under a new id.
export default function BowlAddStatusBanner() {
  const add = useBowlAdd();
  const result = add.result?.ok === false && !isUnsettledAddCode(add.result.code) ? add.result : null;
  if (!result && add.unresolved.length === 0) return null;
  return <div className="page-container pt-3 section-stack">
    {result && <div className="status-error" role="alert">
      {`${add.operation.movie.title} — ${add.operation.bowlName}: ${result.message}`}
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

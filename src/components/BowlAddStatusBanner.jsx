import { useEffect } from "react";
import useBowlAdd from "../hooks/useBowlAdd";
import { isUnsettledAddCode } from "../lib/addBowlMovie";

// Search confirms ordinary successes. A save that finishes after search closes
// gets a brief confirmation here. Errors and unfinished adds remain actionable.
export default function BowlAddStatusBanner() {
  const add = useBowlAdd();
  const result = isUnsettledAddCode(add.result?.code) || (add.result?.ok && !add.backgroundSuccess) ? null : add.result;
  const clearFeedback = add.clearFeedback;
  useEffect(() => {
    if (!result?.ok) return;
    const timeout = setTimeout(clearFeedback, 5000);
    return () => clearTimeout(timeout);
  }, [result, clearFeedback]);
  if (!result && add.unresolved.length === 0) return null;
  return <div className="page-container pt-3 section-stack">
    {result && <div className={result.ok ? "status-success" : "status-error"} role={result.ok ? "status" : "alert"}>
      {result.ok
        ? `Added ${add.operation.movie.title} to ${add.operation.bowlName}`
        : `${add.operation.movie.title} — ${add.operation.bowlName}: ${result.message}`}
      {!result.ok && <button className="icon-btn ml-2" aria-label="Dismiss add result" onClick={clearFeedback}>✕</button>}
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

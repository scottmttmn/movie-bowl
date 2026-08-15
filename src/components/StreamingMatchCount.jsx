import { STREAMING_MATCH_STATUS } from "../hooks/useBowlStreamingMatches";

const pillClasses =
  "inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/55 px-3.5 py-1.5 text-sm font-medium text-slate-400";

export default function StreamingMatchCount({ status, count, onScan }) {
  if (status === STREAMING_MATCH_STATUS.unavailable) return null;

  if (status === STREAMING_MATCH_STATUS.manual) {
    return (
      <button type="button" onClick={onScan} className={`${pillClasses} hover:text-slate-200`}>
        Count titles on my services
      </button>
    );
  }

  if (status === STREAMING_MATCH_STATUS.scanning) {
    return <p className={pillClasses}>Checking your services…</p>;
  }

  return (
    <p className={pillClasses}>
      <span className="font-semibold text-slate-200">{count}</span> on your services
    </p>
  );
}

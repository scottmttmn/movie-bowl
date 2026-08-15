import { STREAMING_MATCH_STATUS } from "../hooks/useBowlStreamingMatches";
import { describeStreamingMatch } from "../utils/streamingMatchSummary";

const basePillClasses =
  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition";

// "warning" is its own tone on purpose: streaming priority is engaged but
// changing nothing, which should not look like a filter that is working.
const TONE_CLASSES = {
  idle: "border-slate-700/80 bg-slate-950/55 text-slate-400",
  active: "border-rose-700 bg-rose-950/30 text-rose-300",
  warning: "border-amber-700 bg-amber-950/30 text-amber-300",
};

const DOT_CLASSES = {
  idle: "border border-slate-500",
  active: "bg-rose-400",
  warning: "bg-amber-400",
};

function StateDot({ tone }) {
  return <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />;
}

const COUNT_CLASSES = {
  idle: "font-semibold text-slate-200",
  active: "font-semibold text-rose-200",
  warning: "font-semibold text-amber-200",
};

export default function StreamingMatchCount({
  status,
  count,
  topService,
  topServiceCount,
  isPrioritized = false,
  useServiceRank = true,
  onScan,
  onOpenPreferences,
}) {
  if (status === STREAMING_MATCH_STATUS.unavailable) return null;

  const pendingTone = isPrioritized ? "active" : "idle";

  if (status === STREAMING_MATCH_STATUS.manual) {
    return (
      <button
        type="button"
        data-tone={pendingTone}
        onClick={onScan}
        className={`${basePillClasses} ${TONE_CLASSES[pendingTone]} hover:text-slate-200`}
      >
        <StateDot tone={pendingTone} />
        Count titles on my services
      </button>
    );
  }

  if (status === STREAMING_MATCH_STATUS.scanning) {
    return (
      <p data-tone={pendingTone} className={`${basePillClasses} ${TONE_CLASSES[pendingTone]}`}>
        <StateDot tone={pendingTone} />
        Checking your services…
      </p>
    );
  }

  const { tone, lead, count: emphasizedCount, trail, label } = describeStreamingMatch({
    matchCount: count,
    topService,
    topServiceCount,
    isPrioritized,
    useServiceRank,
  });

  return (
    <button
      type="button"
      data-tone={tone}
      onClick={onOpenPreferences}
      aria-label={`${label} Open streaming match preferences.`}
      className={`${basePillClasses} ${TONE_CLASSES[tone]} hover:border-slate-500`}
    >
      <StateDot tone={tone} />
      <span>
        {lead ? `${lead} ` : null}
        {emphasizedCount === null ? null : (
          <span className={COUNT_CLASSES[tone]}>{emphasizedCount}</span>
        )}
        {trail ? ` ${trail}` : null}
      </span>
    </button>
  );
}

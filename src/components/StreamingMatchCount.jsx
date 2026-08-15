import { STREAMING_MATCH_STATUS } from "../hooks/useBowlStreamingMatches";

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

// The count is only half the answer: the same number means something different
// depending on whether the draw is actually narrowing to those titles, so the
// chip carries that state and opens the control that changes it.
function describeReadyState({ count, topService, topServiceCount, isPrioritized, useServiceRank }) {
  if (!isPrioritized) {
    return {
      tone: "idle",
      body: (
        <>
          <span className="font-semibold text-slate-200">{count}</span> on your services
        </>
      ),
      label: `${count} remaining titles are on your streaming services. The draw is not filtered by them — open streaming match preferences.`,
    };
  }

  if (count === 0) {
    return {
      tone: "warning",
      body: <>No matches — drawing from all</>,
      label:
        "No remaining titles are on your streaming services, so the draw falls back to every title. Open streaming match preferences.",
    };
  }

  if (useServiceRank && topService) {
    return {
      tone: "active",
      body: (
        <>
          Favoring <span className="font-semibold text-rose-200">{topServiceCount}</span> on{" "}
          {topService}
        </>
      ),
      label: `The draw is favoring the ${topServiceCount} remaining titles on ${topService}, your highest-ranked matching service. Open streaming match preferences.`,
    };
  }

  return {
    tone: "active",
    body: (
      <>
        Favoring <span className="font-semibold text-rose-200">{count}</span> on your services
      </>
    ),
    label: `The draw is favoring the ${count} remaining titles on your streaming services. Open streaming match preferences.`,
  };
}

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

  const { tone, body, label } = describeReadyState({
    count,
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
      aria-label={label}
      className={`${basePillClasses} ${TONE_CLASSES[tone]} hover:border-slate-500`}
    >
      <StateDot tone={tone} />
      {body}
    </button>
  );
}

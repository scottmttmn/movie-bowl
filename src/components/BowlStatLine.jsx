import { Fragment } from "react";
import { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import { STREAMING_MATCH_STATUS } from "../hooks/useBowlStreamingMatches";
import { describeStreamingMatch } from "../utils/streamingMatchSummary";

// One quiet sentence under the bowl instead of a row of chips. Each segment is
// still a readout of what the draw is about to do, so the chip tone vocabulary
// carries over: idle = nothing is narrowing, active = a preference is narrowing
// the draw, warning = the narrowing should give you pause.
const TEXT_CLASSES = {
  idle: "text-slate-400",
  active: "text-rose-300",
  warning: "text-amber-300",
};

const COUNT_CLASSES = {
  idle: "font-semibold text-slate-100",
  active: "font-semibold text-rose-200",
  warning: "font-semibold text-amber-200",
};

const HOVER_CLASSES = {
  idle: "hover:text-slate-200",
  active: "hover:text-rose-200",
  warning: "hover:text-amber-200",
};

function Count({ tone = "idle", children }) {
  return <span className={COUNT_CLASSES[tone]}>{children}</span>;
}

// A segment that opens a panel stays a button even before its handler is
// wired, so the control does not pop in and out of the tab order.
function Segment({ as = "span", tone = "idle", onClick, ariaLabel, children }) {
  if (as === "button") {
    return (
      <button
        type="button"
        data-tone={tone}
        onClick={onClick}
        aria-label={ariaLabel}
        className={`rounded transition ${TEXT_CLASSES[tone]} ${HOVER_CLASSES[tone]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60`}
      >
        {children}
      </button>
    );
  }
  return (
    <span data-tone={tone} className={TEXT_CLASSES[tone]}>
      {children}
    </span>
  );
}

function PoolSegment({
  status,
  poolCount,
  totalCount,
  contributorReach,
  showContributorReach,
  hasExcludedContributors,
  onRunLookups,
  onOpenFilters,
}) {
  if (status === DRAW_POOL_STATUS.manual) {
    return (
      <Segment as="button" tone="active" onClick={onRunLookups}>
        Preview filter matches
      </Segment>
    );
  }

  if (status === DRAW_POOL_STATUS.counting) {
    return (
      <Segment
        as="button"
        tone="idle"
        onClick={onOpenFilters}
        ariaLabel={`${totalCount} movies in the bowl. Filter preview is running in the background.`}
      >
        <Count>{totalCount}</Count> in the bowl
      </Segment>
    );
  }

  if (status === DRAW_POOL_STATUS.unfiltered) {
    return (
      <Segment
        as="button"
        tone="idle"
        onClick={onOpenFilters}
        ariaLabel={`${totalCount} movies in the bowl. Open draw filters.`}
      >
        <Count>{totalCount}</Count> in the bowl
      </Segment>
    );
  }

  const { totalCount: contributorTotal = 0, reachedCount = 0 } = contributorReach || {};
  // An empty pool means the draw cannot produce anything, and a filter that
  // has shut someone out is the other thing worth stopping to read.
  const tone = poolCount === 0 || hasExcludedContributors ? "warning" : "active";
  const label =
    showContributorReach && hasExcludedContributors
      ? `Drawing from ${poolCount} of ${totalCount} titles, reaching ${reachedCount} of ${contributorTotal} people. Open draw filters.`
      : `Drawing from ${poolCount} of ${totalCount} titles. Open draw filters.`;

  return (
    <Segment as="button" tone={tone} onClick={onOpenFilters} ariaLabel={label}>
      <Count tone={tone}>{poolCount}</Count> of {totalCount} eligible
      {showContributorReach && hasExcludedContributors
        ? ` · ${reachedCount} of ${contributorTotal} people represented`
        : null}
    </Segment>
  );
}

function StreamingSegment({
  status,
  matchCount,
  topService,
  topServiceCount,
  isPrioritized,
  useServiceRank,
  onScan,
  onOpenPreferences,
}) {
  // "warning" is its own tone on purpose: streaming priority engaged but
  // changing nothing should not look like a filter that is working.
  const pendingTone = isPrioritized ? "active" : "idle";

  if (status === STREAMING_MATCH_STATUS.manual) {
    return (
      <Segment as="button" tone={pendingTone} onClick={onScan}>
        Check your services
      </Segment>
    );
  }

  if (status === STREAMING_MATCH_STATUS.scanning) {
    return <Segment tone={pendingTone}>Checking your services…</Segment>;
  }

  const { tone, lead, count, trail, label } = describeStreamingMatch({
    matchCount,
    topService,
    topServiceCount,
    isPrioritized,
    useServiceRank,
  });

  return (
    <Segment
      as="button"
      tone={tone}
      onClick={onOpenPreferences}
      ariaLabel={`${label} Open streaming match preferences.`}
    >
      {lead ? `${lead} ` : null}
      {count === null ? null : <Count tone={tone}>{count}</Count>}
      {trail ? ` ${trail}` : null}
    </Segment>
  );
}

export default function BowlStatLine({
  poolStatus,
  poolCount,
  poolTotalCount,
  contributorReach = null,
  showContributorReach = false,
  onRunPoolLookups,
  streamingStatus,
  streamingMatchCount,
  streamingTopService,
  streamingTopServiceCount,
  isPrioritized = false,
  useServiceRank = true,
  onScanStreaming,
  onOpenFilters,
  onOpenMethodInfo,
}) {
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const hasExcludedContributors = showContributorReach && excludedCount > 0;

  const segments = [
    <PoolSegment
      key="pool"
      status={poolStatus}
      poolCount={poolCount}
      totalCount={poolTotalCount}
      contributorReach={contributorReach}
      showContributorReach={showContributorReach}
      hasExcludedContributors={hasExcludedContributors}
      onRunLookups={onRunPoolLookups}
      onOpenFilters={onOpenFilters}
    />,
  ];

  if (poolStatus === DRAW_POOL_STATUS.counting) {
    segments.push(
      <Segment
        key="filter-details"
        as="button"
        tone="idle"
        onClick={onOpenFilters}
        ariaLabel="View filter lookup progress"
      >
        Filter details
      </Segment>
    );
  }

  if (streamingStatus !== STREAMING_MATCH_STATUS.unavailable) {
    segments.push(
      <StreamingSegment
        key="streaming"
        status={streamingStatus}
        matchCount={streamingMatchCount}
        topService={streamingTopService}
        topServiceCount={streamingTopServiceCount}
        isPrioritized={isPrioritized}
        useServiceRank={useServiceRank}
        onScan={onScanStreaming}
        onOpenPreferences={onOpenFilters}
      />
    );
  }

  return (
    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm font-medium text-slate-400">
      {segments.map((segment, index) => (
        <Fragment key={segment.key}>
          {index > 0 && <span aria-hidden="true">·</span>}
          {segment}
        </Fragment>
      ))}
      <button
        type="button"
        onClick={onOpenMethodInfo}
        aria-label={
          hasExcludedContributors
            ? "How this bowl picks — some people are filtered out"
            : "How this bowl picks"
        }
        className={`rounded px-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 ${
          hasExcludedContributors
            ? "text-amber-400 hover:text-amber-200"
            : "text-slate-500 hover:text-slate-200"
        }`}
      >
        ⓘ
      </button>
    </p>
  );
}

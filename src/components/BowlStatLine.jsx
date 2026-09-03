import { Fragment } from "react";
import { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import { getDrawReadout } from "../utils/drawReadout";

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

function PoolSegment({ count, service, tone, onOpenFilters }) {
  if (count === 0) {
    return (
      <Segment as="button" tone="warning" onClick={onOpenFilters} ariaLabel="Nothing is eligible to draw. Open draw filters.">
        Nothing to draw
      </Segment>
    );
  }
  const label = service
    ? `Drawing from ${count} titles on ${service}. Open draw filters.`
    : `Drawing from ${count} titles. Open draw filters.`;
  return (
    <Segment as="button" tone={tone} onClick={onOpenFilters} ariaLabel={label}>
      Drawing from <Count tone={tone}>{count}</Count>{service ? ` on ${service}` : ""}
    </Segment>
  );
}

// The people readout is the one fact here that should stop someone, so it keeps
// its own segment -- but as a ratio behind a glyph rather than a clause.
function ReachSegment({ reachedCount, totalCount, onOpenMethodInfo }) {
  return (
    <Segment
      as="button"
      tone="warning"
      onClick={onOpenMethodInfo}
      ariaLabel={`Only ${reachedCount} of ${totalCount} people have a movie in the draw. How this bowl picks.`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-1 inline h-3.5 w-3.5 -translate-y-px" fill="currentColor">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4Z" />
        <circle cx="17.5" cy="9" r="2.6" />
        <path d="M15.4 14.9c2.9-.5 5.6 1.2 5.6 4.1v1h-4.6c0-1.9-.4-3.6-1-5.1Z" />
      </svg>
      <Count tone="warning">{reachedCount}</Count>/{totalCount}
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
  onOpenFilters,
  onOpenMethodInfo,
}) {
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const hasExcludedContributors = showContributorReach && excludedCount > 0;

  const segments = [];

  if (poolStatus === DRAW_POOL_STATUS.manual) {
    segments.push(
      <Segment key="pool" as="button" tone="active" onClick={onRunPoolLookups}>
        Preview filter matches
      </Segment>
    );
  } else {
    const { count, service, tone } = getDrawReadout({
      isFiltered: poolStatus === DRAW_POOL_STATUS.ready,
      poolCount,
      poolTotalCount,
      streamingStatus,
      streamingMatchCount,
      streamingTopService,
      streamingTopServiceCount,
      isPrioritized,
      useServiceRank,
      hasExcludedContributors,
    });
    segments.push(
      <PoolSegment key="pool" count={count} service={service} tone={tone} onOpenFilters={onOpenFilters} />
    );
  }

  if (hasExcludedContributors) {
    segments.push(
      <ReachSegment
        key="reach"
        reachedCount={contributorReach.reachedCount}
        totalCount={contributorReach.totalCount}
        onOpenMethodInfo={onOpenMethodInfo}
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

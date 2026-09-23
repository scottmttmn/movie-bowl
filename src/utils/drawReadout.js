import { STREAMING_MATCH_STATUS, STREAMING_MATCH_TONE } from "./streamingMatchSummary";

/**
 * One number answers the question the readout exists for: what is the draw
 * about to choose among, and where will it be watched. The denominator and the
 * per-service breakdown live behind the filter panels -- printing them here
 * made the reader do arithmetic that changes no decision.
 *
 * Shared so the phone stat line and the television say the same thing about
 * the same state. The tone vocabulary is the streaming one: idle = nothing is
 * narrowing, active = a preference is narrowing the draw, warning = the
 * narrowing should give you pause.
 */
export function getDrawReadout({
  isFiltered = false,
  poolCount = 0,
  poolTotalCount = 0,
  streamingStatus = STREAMING_MATCH_STATUS.unavailable,
  streamingMatchCount = 0,
  streamingTopService = null,
  streamingTopServiceCount = 0,
  isPrioritized = false,
  useServiceRank = true,
  hasExcludedContributors = false,
} = {}) {
  const eligible = isFiltered ? poolCount : poolTotalCount;
  const streamingResolved = streamingStatus !== STREAMING_MATCH_STATUS.unavailable;

  let count = eligible;
  let service = null;
  let fellBack = false;

  // Streaming priority narrows the pool further, so when it is on and matching
  // it owns the count. Its own tally and the eligible count were the same
  // number printed twice.
  if (isPrioritized && streamingResolved && streamingMatchCount > 0) {
    if (useServiceRank && streamingTopService) {
      count = streamingTopServiceCount;
      service = streamingTopService;
    } else {
      count = streamingMatchCount;
    }
  } else {
    // Priority is on and matched nothing, so the draw quietly falls back to the
    // eligible pool. The tone says so, because a preference that is engaged and
    // changing nothing should not look settled.
    fellBack = isPrioritized && streamingResolved && streamingMatchCount === 0;
  }

  const tone =
    hasExcludedContributors || fellBack
      ? STREAMING_MATCH_TONE.warning
      : service || isFiltered
        ? STREAMING_MATCH_TONE.active
        : STREAMING_MATCH_TONE.idle;

  return { count, service, fellBack, tone };
}

// The pool statuses this module reads, repeated here rather than imported so
// utils stays free of hooks. They must match DRAW_POOL_STATUS.
const POOL_STATUS_MANUAL = "manual";
const POOL_STATUS_READY = "ready";

/**
 * Everything the bowl's stat line says, as data rather than markup.
 *
 * Plain values only, because the dashboard stores the settled answer and opens
 * the next visit on it: `pool` is either `{ kind: "manual" }` -- the count waits
 * to be asked for -- or the readout above, and `reach` is present only when some
 * people have nothing left in the draw.
 */
export function describeStatLine({
  poolStatus,
  poolCount = 0,
  poolTotalCount = 0,
  contributorReach = null,
  showContributorReach = false,
  streamingStatus,
  streamingMatchCount = 0,
  streamingTopService = null,
  streamingTopServiceCount = 0,
  isPrioritized = false,
  useServiceRank = true,
} = {}) {
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const hasExcludedContributors = showContributorReach && excludedCount > 0;
  const reach = hasExcludedContributors
    ? { reachedCount: contributorReach.reachedCount, totalCount: contributorReach.totalCount }
    : null;

  if (poolStatus === POOL_STATUS_MANUAL) return { pool: { kind: "manual" }, reach };

  const { count, service, tone } = getDrawReadout({
    isFiltered: poolStatus === POOL_STATUS_READY,
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
  return { pool: { kind: "count", count, service, tone }, reach };
}

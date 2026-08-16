import { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import StatePill, { PillCount } from "./StatePill";

export default function DrawPoolCount({
  status,
  poolCount,
  totalCount,
  contributorReach,
  showContributorReach = false,
  onRunLookups,
  onOpenFilters,
}) {
  if (status === DRAW_POOL_STATUS.unfiltered) return null;

  if (status === DRAW_POOL_STATUS.manual) {
    return (
      <StatePill as="button" tone="active" onClick={onRunLookups}>
        Count titles your filters allow
      </StatePill>
    );
  }

  if (status === DRAW_POOL_STATUS.counting) {
    return <StatePill tone="active">Checking your filters…</StatePill>;
  }

  const { totalCount: contributorTotal = 0, reachedCount = 0 } = contributorReach || {};
  const hasUnreachableContributors = showContributorReach && reachedCount < contributorTotal;
  // An empty pool means the draw button cannot produce anything, and a filter
  // that has shut someone out is the other thing worth stopping to read.
  const tone = poolCount === 0 || hasUnreachableContributors ? "warning" : "active";

  const label = hasUnreachableContributors
    ? `Drawing from ${poolCount} of ${totalCount} titles, reaching ${reachedCount} of ${contributorTotal} people. Open draw filters.`
    : `Drawing from ${poolCount} of ${totalCount} titles. Open draw filters.`;

  return (
    <StatePill as="button" tone={tone} onClick={onOpenFilters} ariaLabel={label}>
      <span>
        Drawing from <PillCount tone={tone}>{poolCount}</PillCount>
        {hasUnreachableContributors ? (
          <>
            {" · "}
            <PillCount tone={tone}>{reachedCount}</PillCount>
            {` of ${contributorTotal} people`}
          </>
        ) : null}
      </span>
    </StatePill>
  );
}

import { getDrawMethod } from "../utils/drawMethods";

// Names read better than raw counts, but a contributor who joined through an
// add link may have no display name at all, so the count is what always holds.
function describeExcludedContributors(excludedNames, excludedCount) {
  if (excludedNames.length === 0) {
    return excludedCount === 1
      ? "One person has no movies left in the pool."
      : `${excludedCount} people have no movies left in the pool.`;
  }
  if (excludedNames.length < excludedCount) {
    return `No movies from ${excludedNames.join(", ")} (and ${excludedCount - excludedNames.length} more) are in the pool.`;
  }
  if (excludedNames.length === 1) {
    return `No movies from ${excludedNames[0]} are in the pool.`;
  }
  const leading = excludedNames.slice(0, -1).join(", ");
  return `No movies from ${leading} or ${excludedNames[excludedNames.length - 1]} are in the pool.`;
}

export default function DrawMethodDisclosure({ drawMethod, contributorReach = null }) {
  const method = getDrawMethod(drawMethod);
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const showReach = excludedCount > 0;

  return (
    <details className="group mx-auto mt-3 max-w-xl text-left">
      <summary
        className={`mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 [&::-webkit-details-marker]:hidden ${
          showReach ? "text-amber-300 hover:text-amber-200" : "text-slate-400 hover:text-slate-200"
        }`}
      >
        <span aria-hidden="true" className={showReach ? "text-amber-400" : "text-slate-500"}>
          ⓘ
        </span>
        {showReach ? "How this bowl picks — some people are filtered out" : "How this bowl picks"}
        <span
          aria-hidden="true"
          className={`text-[10px] transition-transform group-open:rotate-180 ${
            showReach ? "text-amber-400" : "text-slate-500"
          }`}
        >
          ▾
        </span>
      </summary>
      <div className="mx-auto mt-2 max-w-lg space-y-2">
        <p className="rounded-xl border border-slate-800 bg-slate-950/45 px-3.5 py-3 text-sm leading-6 text-slate-300">
          {method.disclosure}
        </p>
        {showReach && (
          <p className="rounded-xl border border-amber-800/70 bg-amber-950/25 px-3.5 py-3 text-sm leading-6 text-amber-200">
            {describeExcludedContributors(contributorReach.excludedNames, excludedCount)}{" "}
            {method.reachCaveat}
          </p>
        )}
      </div>
    </details>
  );
}

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

export default function DrawMethodInfoModal({ drawMethod, contributorReach = null, onClose }) {
  const method = getDrawMethod(drawMethod);
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const showReach = excludedCount > 0;

  return (
    <div className="modal-overlay z-[70]" role="presentation" onClick={onClose}>
      <div
        className="modal-surface max-w-md p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-method-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="draw-method-info-title" className="text-lg font-semibold text-slate-100">
          How this bowl picks
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">{method.disclosure}</p>
        {showReach && (
          <p className="mt-3 rounded-xl border border-amber-800/70 bg-amber-950/25 px-3.5 py-3 text-sm leading-6 text-amber-200">
            {describeExcludedContributors(contributorReach.excludedNames, excludedCount)}{" "}
            {method.reachCaveat}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

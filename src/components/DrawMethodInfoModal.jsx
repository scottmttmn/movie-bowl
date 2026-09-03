import { getDrawMethod } from "../utils/drawMethods";

// Names read better than raw counts, but a contributor who joined through an
// add link may have no display name at all, so the count is what always holds.
function describeExcludedContributors(excludedNames, excludedCount) {
  if (excludedNames.length === 0) {
    return excludedCount === 1 ? "One person is left out" : `${excludedCount} people are left out`;
  }
  if (excludedNames.length < excludedCount) {
    return `${excludedNames.join(", ")} and ${excludedCount - excludedNames.length} more are left out`;
  }
  if (excludedNames.length === 1) return `${excludedNames[0]} is left out`;
  const leading = excludedNames.slice(0, -1).join(", ");
  return `${leading} and ${excludedNames[excludedNames.length - 1]} are left out`;
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
        <ol className="mt-3 space-y-3">
          {method.steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950/60 text-xs font-semibold text-slate-300"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-100">{step.title}</span>
                <span className="mt-0.5 block text-sm text-slate-400">{step.note}</span>
              </span>
            </li>
          ))}
        </ol>
        {method.footnote && <p className="mt-3 text-sm text-slate-400">{method.footnote}</p>}
        {showReach && (
          <p className="mt-4 rounded-xl border border-amber-800/70 bg-amber-950/25 px-3.5 py-3 text-sm leading-6 text-amber-200">
            {describeExcludedContributors(contributorReach.excludedNames, excludedCount)} — your filters
            removed every movie they added.{method.reachCaveat ? ` ${method.reachCaveat}` : ""}
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

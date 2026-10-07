import DrawMethodMark from "./DrawMethodMark";
import { getDrawMethod } from "../utils/drawMethods";

// One small picture per step, so the sheet reads at a glance: the same person
// badge and paper slip the method's mark is built from, plus the ribbon a
// favorite wears on its poster.
const SLIP = (
  <>
    <path d="M3.8 6.1L18.5 3.9L20.7 18.2L6 20.4Z" fill="#e7dfd1" />
    <path d="M4.9 13.2L19.6 11" stroke="#c5b9a7" strokeWidth="0.55" />
  </>
);

const STEP_ICONS = {
  person: (
    <>
      <circle cx="12" cy="12" r="10" fill="#64748b" stroke="#0f172a" strokeWidth="1" />
      <circle cx="12" cy="9.2" r="3.2" fill="#fff" />
      <path d="M6.4 18.4a5.6 5.6 0 0 1 11.2 0z" fill="#fff" />
    </>
  ),
  turns: (
    <g fill="none" stroke="#e2e8f0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12V10c0-1.4 1-2.4 2.4-2.4h11M19 12v2c0 1.4-1 2.4-2.4 2.4h-11" />
      <path d="M16 5.4l2.4 2.2-2.4 2.2M8 14.2L5.6 16.4 8 18.6" />
    </g>
  ),
  slip: SLIP,
  favorite: (
    <>
      {SLIP}
      <path d="M13.2 3.6h4.6v8.4l-2.3-1.8-2.3 1.8z" fill="#e11d48" />
    </>
  ),
};

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

export default function DrawMethodInfoModal({ drawMethod, contributorReach = null, onChange = null, onClose }) {
  const method = getDrawMethod(drawMethod);
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const showReach = excludedCount > 0;
  // Nobody left but the pack: the draw still happens, from the pack alone, and
  // "left out" on its own read as though the bowl could not draw at all.
  const drawsFromPackOnly = showReach &&
    contributorReach.reachedCount === 0 &&
    contributorReach.packTitleCount > 0;

  return (
    <div className="modal-overlay z-[70]" role="presentation" onClick={onClose}>
      <div
        className="modal-surface max-w-sm p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-method-info-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The same slip the button shows, so the sheet is visibly about it. */}
        <div className="flex items-center gap-3">
          <DrawMethodMark drawMethod={method.id} className="h-12 w-12 shrink-0" decorative />
          <h3 id="draw-method-info-title" className="text-lg font-semibold text-slate-100">
            {method.label} draw
          </h3>
        </div>
        <ol className="mt-4 space-y-2.5">
          {method.steps.map((step) => (
            <li key={step.title} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950/60">
                <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
                  {STEP_ICONS[step.icon]}
                </svg>
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-semibold text-slate-100">{step.title}</span>
                {step.note && <span className="text-slate-400"> · {step.note}</span>}
              </span>
            </li>
          ))}
        </ol>
        {showReach && (
          <p className="mt-4 rounded-xl border border-amber-800/70 bg-amber-950/25 px-3.5 py-3 text-sm leading-6 text-amber-200">
            {describeExcludedContributors(contributorReach.excludedNames, excludedCount)} — your filters
            removed every movie they added
            {drawsFromPackOnly ? ", so tonight's draw is a straight pick from the starter pack." : "."}
            {method.reachCaveat ? ` ${method.reachCaveat}` : ""}
          </p>
        )}
        {/* Only the owner can change the method, so only the owner gets the way there. */}
        <div className={`mt-5 flex items-center gap-2 ${onChange ? "justify-between" : "justify-end"}`}>
          {onChange && (
            <button type="button" onClick={onChange} className="btn btn-ghost px-2 text-sm">
              Change
            </button>
          )}
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

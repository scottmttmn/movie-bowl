import { useEffect, useRef, useState } from "react";
import RestaurantSlip from "./RestaurantSlip";
import { getMovieAttributionLabel } from "../utils/drawBuckets";
import { getRestaurantDirectionsUrl } from "../utils/restaurants";

function Icon({ children }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// A restaurant slip opened: the drawn pick, or one from My Restaurants or Been
// there. It answers the one question left once a place is chosen, which is how
// to get there. Reserve, Website and Call join Directions with Google search.
export default function RestaurantSheet({
  slip,
  tonight = false,
  onClose,
  onDelete = null,
  deleteLabel = "Remove from bowl",
  primaryActionLabel = null,
  onPrimaryAction = null,
  primaryActionNote = null,
}) {
  const closeButton = useRef(null);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const addedByLabel = getMovieAttributionLabel(slip);
  const initial = (addedByLabel || "").trim().charAt(0).toUpperCase();
  const directionsUrl = getRestaurantDirectionsUrl(slip);

  useEffect(() => {
    closeButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const run = async (action) => {
    setActionError("");
    setIsWorking(true);
    try {
      const result = await action(slip);
      if (result && result.ok === false && result.message) setActionError(result.message);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div
        className="modal-surface flex max-h-[92dvh] w-full max-w-xl flex-col overflow-clip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurant-sheet-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-7 sm:py-4">
          {tonight ? <span aria-hidden="true" /> : <p className="eyebrow">Restaurant</p>}
          <button ref={closeButton} type="button" className="icon-btn shrink-0" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 pb-7 sm:px-7">
          <div className="grid grid-cols-[minmax(96px,1fr)_minmax(0,2fr)] items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6">
            <RestaurantSlip slip={slip} size="big" />
            <div className="min-w-0 py-1">
              <h2 id="restaurant-sheet-title" className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-3xl">
                {slip.title}
              </h2>
              {slip.cuisine && <p className="mt-2 text-sm text-slate-400">{slip.cuisine}</p>}
              {slip.note ? (
                <figure className="tonight-slip mt-3">
                  {initial && <span className="tonight-slip-avatar" title={addedByLabel}>{initial}</span>}
                  <blockquote>{slip.note}</blockquote>
                </figure>
              ) : addedByLabel ? (
                <p className="mt-3 text-sm text-slate-400">Added by <span className="text-slate-200">{addedByLabel}</span></p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2.5">
            {directionsUrl && (
              <a className="btn btn-primary w-full" href={directionsUrl} target="_blank" rel="noreferrer">
                <Icon>
                  <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </Icon>
                Directions
              </a>
            )}
            {primaryActionLabel && onPrimaryAction && (
              <button type="button" className="btn btn-secondary w-full" disabled={isWorking} onClick={() => run(onPrimaryAction)}>
                {primaryActionLabel}
              </button>
            )}
            {primaryActionNote && <p className="text-sm text-slate-400">{primaryActionNote}</p>}
            {onDelete && (
              <button type="button" className="btn btn-ghost w-full text-sm text-rose-300" disabled={isWorking} onClick={() => run(onDelete)}>
                {deleteLabel}
              </button>
            )}
            {actionError && <p className="text-sm text-rose-300" role="alert">{actionError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

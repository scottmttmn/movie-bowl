import { useEffect, useRef } from "react";

// Switching bowls and choosing the home bowl are different actions, so this
// component keeps them visually separate: rows navigate, and one command below
// them moves the home designation. It renders state and calls back; every
// mutation stays with the caller.
export default function BowlPicker({
  isOpen,
  bowls,
  currentBowlId,
  homeBowlId,
  currentBowlName,
  isLoading = false,
  loadError = null,
  onRetry,
  onSelectBowl,
  onMakeHome,
  isSavingHome = false,
  homeError = null,
  homeMessage = null,
  onCreateBowl,
  isCreateLimitReached = false,
  createLimitMessage = null,
  triggerRef = null,
  onClose,
}) {
  const dialogRef = useRef(null);
  const listRef = useRef(null);

  // Same dismissal contract as the draw-filters panel: lock the page, trap Tab,
  // and hand focus back on close. Restore to the trigger by reference rather
  // than to whatever happened to be focused -- a pointer press does not always
  // leave focus on the button it activated.
  useEffect(() => {
    if (!isOpen) return undefined;
    const dialog = dialogRef.current;
    // Captured at open time: the trigger stays mounted for the dialog's whole
    // life, and reading the ref during cleanup would be reading it too late.
    const trigger = triggerRef?.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (dialog?.querySelector("[data-picker-autofocus]") || dialog)?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button:not(:disabled), a[href]")];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      const restoreTo = trigger?.isConnected
        ? trigger
        : (previousFocus?.isConnected ? previousFocus : null);
      restoreTo?.focus({ preventScroll: true });
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  // Arrow keys are an accelerator over the rows; Tab still walks the dialog.
  const handleRowKeyDown = (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = [...(listRef.current?.querySelectorAll("[data-picker-row]") || [])];
    const index = rows.indexOf(event.currentTarget);
    if (index === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    rows[(next + rows.length) % rows.length]?.focus();
  };

  const owned = bowls.filter((bowl) => bowl.role === "Owner");
  const shared = bowls.filter((bowl) => bowl.role !== "Owner");
  const isCurrentBowlHome = Boolean(currentBowlId) && currentBowlId === homeBowlId;

  const describeCounts = (bowl) => [
    `${bowl.remainingCount} to draw`,
    `${bowl.memberCount} member${bowl.memberCount === 1 ? "" : "s"}`,
  ].join(" · ");

  const describeRow = (bowl) => [
    bowl.name,
    bowl.id === currentBowlId ? "current bowl" : null,
    bowl.id === homeBowlId ? "home bowl" : null,
    describeCounts(bowl),
  ].filter(Boolean).join(", ");

  const renderGroup = (label, group) => group.length === 0 ? null : (
    <div key={label} className="px-1 py-2">
      <h4 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h4>
      <ul className="space-y-1">
        {group.map((bowl) => (
          <li key={bowl.id}>
            <button
              type="button"
              data-picker-row
              data-picker-autofocus={bowl.id === currentBowlId ? "true" : undefined}
              onKeyDown={handleRowKeyDown}
              onClick={() => onSelectBowl(bowl.id)}
              aria-label={describeRow(bowl)}
              aria-current={bowl.id === currentBowlId ? "true" : undefined}
              className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left hover:border-slate-700 hover:bg-slate-800/60"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="line-clamp-2 break-words font-medium text-slate-100">{bowl.name}</span>
                  {bowl.id === homeBowlId && (
                    <span aria-hidden="true" className="shrink-0 rounded-full bg-rose-950/70 px-2 py-0.5 text-xs font-semibold text-rose-300">
                      Home
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-400">{describeCounts(bowl)}</span>
              </span>
              {bowl.id === currentBowlId && (
                <span aria-hidden="true" className="shrink-0 text-rose-300">✓</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/85 px-4 backdrop-blur-sm sm:items-start sm:pt-[4.5rem]"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bowl-picker-title"
        onClick={(event) => event.stopPropagation()}
        className="modal-surface flex w-full max-w-md flex-col overflow-clip rounded-b-none rounded-t-3xl sm:w-[360px] sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h3 id="bowl-picker-title" className="text-lg font-semibold text-slate-100">Choose a bowl</h3>
          <button type="button" onClick={onClose} className="icon-btn h-11 w-11 sm:hidden" aria-label="Close bowl picker">✕</button>
        </div>

        <div ref={listRef} className="max-h-[50dvh] flex-1 overflow-y-auto overscroll-contain sm:max-h-[420px]">
          {isLoading && bowls.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400" role="status">Loading your bowls…</p>
          )}
          {loadError && bowls.length === 0 && (
            <div className="px-4 py-6">
              <p className="status-error" role="alert">{loadError}</p>
              <button type="button" onClick={onRetry} className="btn btn-secondary mt-3" data-picker-autofocus="true">
                Try again
              </button>
            </div>
          )}
          {renderGroup("Owned by you", owned)}
          {renderGroup("Shared with you", shared)}
        </div>

        <div className="shrink-0 border-t border-slate-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="sr-only" role="status">{homeMessage || ""}</p>
          {homeError && <p className="status-error mb-2" role="alert">{homeError}</p>}
          {!isCurrentBowlHome && currentBowlId && (
            <button
              type="button"
              onClick={onMakeHome}
              disabled={isSavingHome || isLoading}
              aria-label={`Make ${currentBowlName} my home bowl`}
              className="btn btn-ghost mb-2 w-full justify-start gap-2 text-left"
            >
              <span aria-hidden="true">⌂</span>
              {isSavingHome ? <span>Making home…</span> : (
                <span className="flex min-w-0 gap-1">
                  <span className="shrink-0">Make</span>
                  <span className="min-w-0 truncate">{currentBowlName}</span>
                  <span className="shrink-0">home</span>
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onCreateBowl}
            disabled={isCreateLimitReached}
            className="btn btn-secondary w-full justify-start gap-2 text-left"
          >
            <span aria-hidden="true">+</span>
            <span>Create new bowl</span>
          </button>
          {isCreateLimitReached && createLimitMessage && (
            <p className="mt-2 text-xs text-slate-400">{createLimitMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

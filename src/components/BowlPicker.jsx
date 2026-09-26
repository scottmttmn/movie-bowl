import { useEffect, useLayoutEffect, useRef, useState } from "react";
import bowlImage from "../assets/movie-bowl.webp";
import { findNeighborIndex, getAnchoredPanelLayout } from "../utils/pickerPlacement";

const HOUSE_PATH = "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z";

// Used before the trigger has been measured, and by any caller without one.
const FALLBACK_ANCHOR = { left: 0, width: 0, bottom: 62 };

// Switching bowls and choosing the home bowl are different actions, so this
// component keeps them visually separate: tiles navigate, and one command below
// them moves the home designation. It renders state and calls back; every
// mutation stays with the caller.
//
// It opens as a shelf hung beneath the control that opened it, never as a
// centred modal: centred, it covered the dashboard title it came from, and from
// the header it landed half a screen away from the button. `align` says how it
// lines up with that control.
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
  align = "center",
  onClose,
}) {
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  const [layout, setLayout] = useState(null);

  // Measured before paint so the shelf never flashes in the wrong place. The
  // page cannot scroll while it is open, so only a resize can move the trigger.
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    const measure = () => {
      const rect = triggerRef?.current?.getBoundingClientRect();
      const anchor = rect && (rect.width || rect.height) ? rect : FALLBACK_ANCHOR;
      setLayout({
        anchorBottom: anchor.bottom,
        ...getAnchoredPanelLayout({
          anchor,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          align,
        }),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen, align, triggerRef]);

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

  // Arrow keys are an accelerator over the tiles; Tab still walks the dialog.
  // Without layout (jsdom, or before paint) position means nothing, so they
  // fall back to document order.
  const handleRowKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const rows = [...(listRef.current?.querySelectorAll("[data-picker-row]") || [])];
    const index = rows.indexOf(event.currentTarget);
    if (index === -1) return;
    event.preventDefault();
    const rects = rows.map((row) => row.getBoundingClientRect());
    let next = findNeighborIndex(rects, index, event.key);
    if (next === index && rects.every((rect) => !rect.width && !rect.height)) {
      const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      next = (index + step + rows.length) % rows.length;
    }
    rows[next]?.focus();
  };

  const owned = bowls.filter((bowl) => bowl.role === "Owner");
  const shared = bowls.filter((bowl) => bowl.role !== "Owner");
  const isCurrentBowlHome = Boolean(currentBowlId) && currentBowlId === homeBowlId;
  const canMakeHome = Boolean(currentBowlId) && !isCurrentBowlHome;
  const groups = [["Owned by you", owned], ["Shared with you", shared]]
    .filter(([, group]) => group.length > 0);

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

  // Creating a bowl sits in the grid as one more tile: in the empty cell beside
  // an odd last group, or across the full row otherwise.
  const renderCreateTile = (spanFullRow) => (
    <button
      type="button"
      onClick={onCreateBowl}
      disabled={isCreateLimitReached}
      aria-label="Create new bowl"
      className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-slate-600/70 px-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800/50 hover:text-slate-100 disabled:opacity-50 disabled:hover:bg-transparent ${spanFullRow ? "col-span-2" : ""}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      New bowl
    </button>
  );

  const renderTile = (bowl) => {
    const isCurrent = bowl.id === currentBowlId;
    const isHome = bowl.id === homeBowlId;
    return (
      <button
        key={bowl.id}
        type="button"
        data-picker-row
        data-picker-autofocus={isCurrent ? "true" : undefined}
        onKeyDown={handleRowKeyDown}
        onClick={() => onSelectBowl(bowl.id)}
        aria-label={describeRow(bowl)}
        aria-current={isCurrent ? "true" : undefined}
        className={`relative flex min-w-0 flex-col items-start gap-2 rounded-2xl border p-3 text-left transition sm:min-h-[96px] sm:flex-row sm:items-center sm:gap-3.5 ${isCurrent
          ? "border-[1.5px] border-rose-400 bg-rose-600/10"
          : "border-slate-700/50 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800"}`}
      >
        {isHome && (
          <span aria-hidden="true" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-lg bg-rose-600/15">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-rose-400"><path d={HOUSE_PATH} /></svg>
          </span>
        )}
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950/70 sm:h-16 sm:w-16">
          <img src={bowlImage} alt="" className="h-9 w-9 object-contain sm:h-12 sm:w-12" />
        </span>
        <span className={`min-w-0 ${isHome ? "pr-6" : ""}`}>
          {isCurrent && (
            <span aria-hidden="true" className="mb-0.5 block text-[10.5px] font-extrabold uppercase tracking-wider text-rose-300">Viewing</span>
          )}
          <span className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-slate-100">{bowl.name}</span>
          <span className="mt-1 block text-xs text-slate-400">{describeCounts(bowl)}</span>
        </span>
      </button>
    );
  };

  const panelStyle = layout
    ? { top: layout.top, left: layout.left, width: layout.width, maxHeight: layout.maxHeight }
    : { visibility: "hidden" };

  return (
    <div className="fixed inset-0 z-[70]" role="presentation" onClick={onClose}>
      {/* A light dim below the trigger rather than a blurred wash over the
          page: this is a quick switch, and the control that opened it should
          stay readable above the shelf. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 bg-slate-950/60"
        style={{ top: layout?.anchorBottom ?? 0 }}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bowl-picker-title"
        onClick={(event) => event.stopPropagation()}
        style={panelStyle}
        className="fixed flex flex-col rounded-[22px] border border-slate-600/60 bg-slate-900 text-left shadow-[0_30px_70px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none"
      >
        {/* On a viewport too short to hang below the trigger the shelf rises
            over it, and a caret would point at nothing. */}
        {layout && layout.top >= layout.anchorBottom && (
          <span
            aria-hidden="true"
            className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-slate-600/60 bg-slate-900"
            style={{ left: layout.caretLeft - 7 }}
          />
        )}
        <h3 id="bowl-picker-title" className="sr-only">Choose a bowl</h3>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-4 sm:px-4">
          {isLoading && bowls.length === 0 && (
            <p className="px-1 py-4 text-sm text-slate-400" role="status">Loading your bowls…</p>
          )}
          {loadError && bowls.length === 0 && (
            <div className="px-1 py-4">
              <p className="status-error" role="alert">{loadError}</p>
              <button type="button" onClick={onRetry} className="btn btn-secondary mt-3" data-picker-autofocus="true">
                Try again
              </button>
            </div>
          )}
          <div className="space-y-4">
            {groups.map(([label, group], groupIndex) => {
              const isLastGroup = groupIndex === groups.length - 1;
              return (
                <section key={label}>
                  <h4 className="px-0.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</h4>
                  <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                    {group.map(renderTile)}
                    {isLastGroup && renderCreateTile(group.length % 2 === 0)}
                  </div>
                </section>
              );
            })}
            {groups.length === 0 && !isLoading && (
              <div className="grid grid-cols-2">{renderCreateTile(true)}</div>
            )}
          </div>
          {isCreateLimitReached && createLimitMessage && (
            <p className="mt-2 px-0.5 text-xs text-slate-400">{createLimitMessage}</p>
          )}
        </div>

        <p className="sr-only" role="status">{homeMessage || ""}</p>
        {(canMakeHome || homeError) && (
          <div className="shrink-0 border-t border-slate-800 px-3 py-3 sm:px-4">
            {homeError && <p className="status-error mb-2" role="alert">{homeError}</p>}
            {canMakeHome && (
              <button
                type="button"
                onClick={onMakeHome}
                disabled={isSavingHome || isLoading}
                aria-label={`Make ${currentBowlName} my home bowl`}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-600/10 px-4 text-sm font-semibold text-rose-300 transition hover:bg-rose-600/15 disabled:opacity-60"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <path d={HOUSE_PATH} />
                </svg>
                {isSavingHome ? <span>Making home…</span> : (
                  <span className="flex min-w-0 gap-1">
                    <span className="shrink-0">Make</span>
                    <span className="min-w-0 truncate">{currentBowlName}</span>
                    <span className="shrink-0">home</span>
                  </span>
                )}
              </button>
            )}
          </div>
        )}
        {/* Escape and the dim close it for keyboard and pointer; a screen
            reader on a phone has neither, so it gets a button. It is still a
            Tab stop, so it shows itself when focused rather than being an
            invisible one. */}
        <button
          type="button"
          onClick={onClose}
          className="sr-only focus:not-sr-only focus:mx-3 focus:mb-3 focus:rounded-xl focus:px-3 focus:py-2 focus:text-center focus:text-sm focus:font-semibold focus:text-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-800/60 sm:focus:mx-4"
        >
          Close bowl picker
        </button>
      </div>
    </div>
  );
}

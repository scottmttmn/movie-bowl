import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ServiceLogo from "./ServiceLogo";

// How close to the top or bottom of the window a held row has to be before the
// page scrolls under it, and how far it scrolls each frame.
const AUTO_SCROLL_EDGE_PX = 72;
const AUTO_SCROLL_STEP_PX = 12;

// Ranked list of the account's services. Reordering is one gesture on every
// device: press the grip and slide. It is built on pointer events because
// HTML5 drag and drop never fires for a finger, which left phones with a
// number dropdown instead of the thing the grip promised.
export default function StreamingServiceRanking({ services, onReorder, onRemove }) {
  const listRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocusRef = useRef(null);

  useLayoutEffect(() => {
    const service = pendingFocusRef.current;
    if (!service) return;
    pendingFocusRef.current = null;
    listRef.current
      ?.querySelector(`[data-reorder-handle="${CSS.escape(service)}"]`)
      ?.focus();
  }, [services]);

  const moveTo = (service, toIndex) => {
    const fromIndex = services.indexOf(service);
    if (fromIndex === -1 || toIndex === fromIndex) return;
    if (toIndex < 0 || toIndex >= services.length) return;
    const next = [...services];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, service);
    onReorder(next);
    setAnnouncement(`${service} moved to position ${toIndex + 1} of ${services.length}.`);
  };

  const targetIndexFor = (state, dy) => {
    const { fromIndex, rects } = state;
    const center = rects[fromIndex].top + rects[fromIndex].height / 2 + dy;
    let target = fromIndex;
    for (let i = 0; i < rects.length; i += 1) {
      if (i === fromIndex) continue;
      const mid = rects[i].top + rects[i].height / 2;
      if (i > fromIndex && center >= mid) target = Math.max(target, i);
      if (i < fromIndex && center <= mid) target = Math.min(target, i);
    }
    return target;
  };

  const handlePointerDown = (event, service, index) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const rows = [...(listRef.current?.querySelectorAll("[data-rank-row]") || [])];
    if (rows.length !== services.length) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const state = {
      service,
      fromIndex: index,
      startY: event.clientY,
      startScrollY: window.scrollY,
      clientY: event.clientY,
      rects: rows.map((row) => row.getBoundingClientRect()),
      dy: 0,
      toIndex: index,
    };
    dragRef.current = state;
    setDrag(state);
  };

  // Positions are measured in page coordinates, so the row stays under the
  // finger when the page scrolls beneath it.
  const updateDrag = (clientY) => {
    const state = dragRef.current;
    if (!state) return;
    const first = state.rects[0];
    const last = state.rects[state.rects.length - 1];
    const own = state.rects[state.fromIndex];
    // Keep the lifted row within the list so it cannot be dropped off its end.
    const minDy = first.top - own.top;
    const maxDy = last.bottom - own.bottom;
    const travelled = clientY - state.startY + (window.scrollY - state.startScrollY);
    const dy = Math.min(maxDy, Math.max(minDy, travelled));
    const next = { ...state, clientY, dy, toIndex: targetIndexFor(state, dy) };
    dragRef.current = next;
    setDrag(next);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    updateDrag(event.clientY);
  };

  // A list longer than the screen needs the page to move while a row is held,
  // because the grip stops the finger from scrolling it.
  const isDragging = Boolean(drag);
  useEffect(() => {
    if (!isDragging) return undefined;
    let frame = 0;
    const step = () => {
      const state = dragRef.current;
      if (!state) return;
      let delta = 0;
      if (state.clientY < AUTO_SCROLL_EDGE_PX) delta = -AUTO_SCROLL_STEP_PX;
      if (state.clientY > window.innerHeight - AUTO_SCROLL_EDGE_PX) delta = AUTO_SCROLL_STEP_PX;
      if (delta) {
        const before = window.scrollY;
        window.scrollBy(0, delta);
        if (window.scrollY !== before) updateDrag(state.clientY);
      }
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
    // updateDrag reads only refs and the services it was rendered with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  const finishDrag = () => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (state && state.toIndex !== state.fromIndex) moveTo(state.service, state.toIndex);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const handleKeyDown = (event, service, index) => {
    const offsets = { ArrowUp: -1, ArrowDown: 1 };
    let toIndex = null;
    if (event.key in offsets) toIndex = index + offsets[event.key];
    if (event.key === "Home") toIndex = 0;
    if (event.key === "End") toIndex = services.length - 1;
    if (toIndex === null) return;
    event.preventDefault();
    pendingFocusRef.current = service;
    moveTo(service, toIndex);
  };

  // Where each row sits while a drag is live: the lifted row follows the
  // finger, and the rows it passes slide over by its height to open the gap.
  const offsetFor = (index) => {
    if (!drag) return 0;
    const { fromIndex, toIndex, dy, rects } = drag;
    if (index === fromIndex) return dy;
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
    const shift = rects[fromIndex].height + gap;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return -shift;
    if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return shift;
    return 0;
  };

  // The rank a row shows while dragging is where it will land, so the numbers
  // settle before the finger lifts.
  const shownRank = (index) => {
    if (!drag) return index;
    const { fromIndex, toIndex } = drag;
    if (index === fromIndex) return toIndex;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
    if (toIndex < fromIndex && index >= toIndex && index < fromIndex) return index + 1;
    return index;
  };

  return (
    <>
      <ol ref={listRef} aria-label="Streaming service ranking" className="mt-3 space-y-2">
        {services.map((service, index) => {
          const rank = shownRank(index);
          const lifted = drag?.service === service;
          const first = rank === 0;
          return (
            <li
              key={service}
              data-rank-row
              style={{ transform: `translateY(${offsetFor(index)}px)` }}
              className={`relative ${lifted ? "z-10" : drag ? "transition-transform duration-200 ease-out" : ""}`}
            >
              <div
                className={`flex items-center gap-2 rounded-xl border py-2 pl-2 pr-1 sm:gap-3 sm:p-3 transition-[box-shadow,background-color,border-color,scale] ${
                  lifted
                    ? "scale-[1.02] border-rose-400/70 bg-slate-900 shadow-2xl shadow-black/60"
                    : first
                      ? "border-rose-500/40 bg-rose-950/20"
                      : "border-slate-800 bg-slate-950/40"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums ${
                    first ? "bg-rose-950/60 text-rose-200" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {rank + 1}
                </span>
                <ServiceLogo service={service} className="h-8 w-8 sm:h-9 sm:w-9" />
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-100 sm:text-base">
                  {service}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(service)}
                  disabled={Boolean(drag)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-rose-950/60 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                  aria-label={`Remove ${service}`}
                  title={`Remove ${service}`}
                >
                  ×
                </button>
                <button
                  type="button"
                  data-reorder-handle={service}
                  onPointerDown={(event) => handlePointerDown(event, service, index)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => handleKeyDown(event, service, index)}
                  aria-label={`Reorder ${service}, position ${index + 1} of ${services.length}`}
                  title="Drag to reorder"
                  className={`inline-flex h-11 w-11 shrink-0 touch-none select-none items-center justify-center rounded-lg transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 ${
                    lifted ? "cursor-grabbing text-rose-200" : "cursor-grab text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                    {[5, 10, 15].map((y) => (
                      <g key={y}>
                        <circle cx="7" cy={y} r="1.6" />
                        <circle cx="13" cy={y} r="1.6" />
                      </g>
                    ))}
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </>
  );
}

import { useEffect, useRef, useState } from "react";

export const HOLD_TO_DRAW_MS = 1000;
// Anything shorter is a tap, not an abandoned hold.
export const HOLD_TAP_MS = 250;
const TEASE_FILL = 0.3;
const TEASE_MS = 260;
const DRAIN_MS = 650;

function buzz(ms) {
  // Haptics are a nicety; browsers without them (all of iOS) just get the motion.
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Degrades to no buzz rather than breaking the hold.
  }
}

/**
 * The draw trigger: press and hold for HOLD_TO_DRAW_MS to fire the draw, with
 * a fill sweeping across the button as live progress. Releasing early cancels.
 *
 * Nothing here is written down. A tap starts the fill and lets it drain, which
 * shows that the button fills if you stay on it; an early release drains from
 * where you let go, which shows how close you were. `onHoldStateChange` tells
 * the bowl above so it can move with the hand.
 *
 * The hold gesture is pointer-only, so keyboard and assistive-tech activation
 * arrives as a click with `detail === 0` and goes to `onKeyboardActivate`,
 * which the caller routes to a confirm dialog — the same intent gate the hold
 * provides physically.
 */
export default function HoldToDrawButton({
  onHoldComplete,
  onKeyboardActivate,
  onHoldStateChange,
  label = "Hold to draw",
  ariaLabel = "Draw movie from bowl. Press and hold to draw.",
  disabled = false,
  isLoading = false,
}) {
  // { scale, ms, easing } for the fill; a transition of 0 jumps.
  const [fill, setFill] = useState({ scale: 0, ms: 150, easing: "ease-out" });
  const timersRef = useRef([]);
  const startedAtRef = useRef(null);
  // Bumped by every press, so a drain scheduled for an earlier one cannot
  // overwrite the fill of a hold that has already started.
  const pressRef = useRef(0);
  const isInteractive = !disabled && !isLoading;

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };
  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms));
  };

  useEffect(() => clearTimers, []);

  const drainFrom = (scale) => {
    const press = pressRef.current;
    setFill({ scale, ms: 0, easing: "linear" });
    // Two frames: the first paints the partial fill, the second lets it drain.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (pressRef.current !== press) return;
      setFill({ scale: 0, ms: DRAIN_MS, easing: "ease-in" });
    }));
  };

  const startHold = (event) => {
    // Secondary buttons (right-click) must not start a draw; touch and pen
    // report button 0, so anything greater is a non-primary press.
    if (!isInteractive || event.button > 0) return;
    clearTimers();
    pressRef.current += 1;
    startedAtRef.current = performance.now();
    setFill({ scale: 1, ms: HOLD_TO_DRAW_MS, easing: "linear" });
    onHoldStateChange?.("holding");
    [0.25, 0.5, 0.75].forEach((at) => later(() => buzz(8), HOLD_TO_DRAW_MS * at));
    later(() => {
      startedAtRef.current = null;
      setFill({ scale: 0, ms: 150, easing: "ease-out" });
      buzz(24);
      onHoldStateChange?.("idle");
      onHoldComplete?.();
    }, HOLD_TO_DRAW_MS);
  };

  const endHold = () => {
    if (startedAtRef.current == null) return;
    const held = performance.now() - startedAtRef.current;
    startedAtRef.current = null;
    clearTimers();
    if (held < HOLD_TAP_MS) {
      setFill({ scale: TEASE_FILL, ms: TEASE_MS, easing: "ease-out" });
      later(() => drainFrom(TEASE_FILL), TEASE_MS);
      onHoldStateChange?.("tap");
      later(() => onHoldStateChange?.("idle"), 500);
      return;
    }
    drainFrom(Math.min(1, held / HOLD_TO_DRAW_MS));
    onHoldStateChange?.("idle");
  };

  const handleClick = (event) => {
    // detail === 0 is a keyboard/AT activation; pointer releases arrive with
    // detail >= 1 and are already handled (or cancelled) by the hold itself.
    if (!isInteractive || event.detail !== 0) return;
    onKeyboardActivate?.();
  };

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      className="btn btn-primary relative w-full max-w-sm select-none touch-none overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ WebkitTouchCallout: "none" }}
      aria-label={
        isLoading
          ? "Drawing movie from bowl"
          : ariaLabel
      }
    >
      <span
        aria-hidden="true"
        data-holding={fill.scale === 1 && fill.ms === HOLD_TO_DRAW_MS ? "true" : undefined}
        className="absolute inset-0 origin-left bg-white/20"
        style={{
          transform: `scaleX(${fill.scale})`,
          transition: fill.ms ? `transform ${fill.ms}ms ${fill.easing}` : "none",
        }}
      />
      <span className="relative">{isLoading ? "Drawing..." : label}</span>
    </button>
  );
}

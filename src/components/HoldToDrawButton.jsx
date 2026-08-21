import { useEffect, useRef, useState } from "react";

export const HOLD_TO_DRAW_MS = 1000;

/**
 * The draw trigger: press and hold for HOLD_TO_DRAW_MS to fire the draw, with
 * a fill sweeping across the button as live progress. Releasing early cancels.
 *
 * The hold gesture is pointer-only, so keyboard and assistive-tech activation
 * arrives as a click with `detail === 0` and goes to `onKeyboardActivate`,
 * which the caller routes to a confirm dialog — the same intent gate the hold
 * provides physically.
 */
export default function HoldToDrawButton({
  onHoldComplete,
  onKeyboardActivate,
  disabled = false,
  isLoading = false,
}) {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef(null);
  const isInteractive = !disabled && !isLoading;

  const cancelHold = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsHolding(false);
  };

  useEffect(() => cancelHold, []);

  const startHold = (event) => {
    // Secondary buttons (right-click) must not start a draw; touch and pen
    // report button 0, so anything greater is a non-primary press.
    if (!isInteractive || event.button > 0) return;
    cancelHold();
    setIsHolding(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsHolding(false);
      onHoldComplete?.();
    }, HOLD_TO_DRAW_MS);
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
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
      className="btn btn-primary relative w-full max-w-sm select-none touch-none overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ WebkitTouchCallout: "none" }}
      aria-label={
        isLoading
          ? "Drawing movie from bowl"
          : "Draw movie from bowl. Press and hold to draw."
      }
    >
      <span
        aria-hidden="true"
        data-holding={isHolding ? "true" : undefined}
        className="absolute inset-0 origin-left bg-white/20"
        style={{
          transform: isHolding ? "scaleX(1)" : "scaleX(0)",
          transition: isHolding
            ? `transform ${HOLD_TO_DRAW_MS}ms linear`
            : "transform 150ms ease-out",
        }}
      />
      <span className="relative">{isLoading ? "Drawing..." : "Hold to draw"}</span>
    </button>
  );
}

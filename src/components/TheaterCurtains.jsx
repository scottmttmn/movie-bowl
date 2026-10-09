import { useState } from "react";
import { createPortal } from "react-dom";

const SCALLOPS = 16;

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// The scalloped valance, drawn once in its own box and stretched to the stage.
function Valance() {
  let path = "M0,0 H100 V5.5";
  for (let i = SCALLOPS; i > 0; i -= 1) {
    const right = (i / SCALLOPS) * 100;
    const left = ((i - 1) / SCALLOPS) * 100;
    path += ` Q${(left + right) / 2},12.5 ${left},5.5`;
  }
  return (
    <svg className="theater-valance" viewBox="0 0 100 13" preserveAspectRatio="none">
      <path d={path} />
    </svg>
  );
}

// Two velvet curtains and a valance. Every part is painted once; opening,
// closing, dropping and growing are transforms on those painted layers, which
// the browser moves without painting again. The television's WebView cannot
// repaint a stage of shaded folds sixty times a second, and drawing the folds
// anew each frame is what made them stutter there.
function CurtainPair() {
  return (
    <>
      <div className="theater-curtain" data-side="left" />
      <div className="theater-curtain" data-side="right" />
      <Valance />
    </>
  );
}

/**
 * Theater mode on the television, shown rather than labelled: while it is on,
 * the bowl sits on a stage between two curtains. Turning it on drops them in
 * and draws them aside; turning it off closes them and lifts them away. A page
 * that loads with it already on shows them open, without the ceremony. The
 * phone and the laptop use a plain switch instead -- the usual night is drawn
 * there and watched here, so the stage belongs to the screen people watch.
 *
 * Decoration only: hidden from assistive technology, never in the way of a
 * press, and still under reduced motion.
 */
export default function TheaterCurtains({ enabled }) {
  const [initial] = useState(enabled);
  const [animated, setAnimated] = useState(false);
  // Once the switch has moved, every later change animates too.
  if (!animated && enabled !== initial) setAnimated(true);

  return (
    <div
      className="theater-curtains"
      data-open={enabled ? "" : undefined}
      data-animated={animated ? "" : undefined}
      aria-hidden="true"
    >
      <div className="theater-curtains-drop">
        <CurtainPair />
      </div>
    </div>
  );
}

/**
 * The screen-wide curtains for the draw. The television swaps the page for
 * its draw screen, so this pair stands on its own: `origin` is where the
 * page's curtains stood. They stay open and widen with the stage to the edges
 * of the screen, framing the reveal rather than hiding the start of it.
 */
export function TheaterRevealCurtains({ origin }) {
  const [viewport] = useState(() => ({ width: window.innerWidth || 390, height: window.innerHeight || 844 }));
  if (prefersReducedMotion()) return null;
  const from = origin || { left: 0, top: 0, width: viewport.width, height: viewport.height };
  const start = `translate(${from.left}px, ${from.top}px) scale(${from.width / viewport.width}, ${from.height / viewport.height})`;
  return createPortal(
    <div className="theater-curtains-screen" aria-hidden="true">
      <div className="theater-curtains-grow" style={{ "--curtain-from": start }}>
        <CurtainPair />
      </div>
    </div>,
    document.body
  );
}

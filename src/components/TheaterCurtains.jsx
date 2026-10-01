import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HOLD_TO_DRAW_MS } from "./HoldToDrawButton";
import { easeCurtain, getCurtainShape } from "../utils/theaterCurtains";

const DROP_MS = 550;
const PART_MS = 1300;
const CLOSE_MS = 900;
const REOPEN_MS = 500;
const GROW_MS = 400;
const REVEAL_PART_MS = 1000;

const VELVET = { dark: "#4a0716", mid: "#7d1029", light: "#a91b39", hi: "#c72a47" };

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// A number that moves toward wherever it is told to, one frame at a time.
// Telling it somewhere new mid-flight starts from where it is, so a hold let go
// halfway reopens from halfway rather than jumping.
function useTween(initial) {
  const [value, setValue] = useState(initial);
  const current = useRef(initial);
  const frame = useRef(null);
  const settle = useRef(null);

  const stop = useCallback(() => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = null;
    settle.current?.();
    settle.current = null;
  }, []);

  const animate = useCallback((to, ms, ease = easeCurtain) => {
    stop();
    const from = current.current;
    if (!ms || from === to) {
      current.current = to;
      setValue(to);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      settle.current = resolve;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / ms);
        current.current = from + (to - from) * ease(t);
        setValue(current.current);
        if (t < 1) frame.current = window.requestAnimationFrame(step);
        else {
          frame.current = null;
          settle.current = null;
          resolve();
        }
      };
      frame.current = window.requestAnimationFrame(step);
    });
  }, [stop]);

  useEffect(() => stop, [stop]);
  return [value, animate];
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const read = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

const toPoints = (points, mirror, width, offsetX = 0, offsetY = 0) =>
  points
    .map(([x, y]) => `${(offsetX + (mirror ? width - x : x)).toFixed(1)},${(offsetY + y).toFixed(1)}`)
    .join(" ");

/**
 * Two velvet curtains, a scalloped valance and gold tie-backs, painted for one
 * rectangle. Pure drawing: everything that moves comes in as `openness`,
 * `spread` and the rectangle itself.
 */
function CurtainArt({ rect, openness, spread, radius, fade }) {
  const id = useId().replace(/:/g, "");
  const { x, y, width, height } = rect;
  if (!width || !height) return null;
  const shape = getCurtainShape({ width, height, openness: easeCurtain(openness), spread });
  const valanceHeight = Math.min(26, height * 0.1);
  const scallops = Math.max(4, Math.round(width / 32));
  let valance = `M${x},${y} H${x + width} V${y + valanceHeight * 0.55}`;
  for (let i = scallops; i > 0; i -= 1) {
    const right = x + (i / scallops) * width;
    const left = x + ((i - 1) / scallops) * width;
    valance += ` Q${(left + right) / 2},${y + valanceHeight * 1.25} ${left},${y + valanceHeight * 0.55}`;
  }
  const tieOpacity = Math.max(0, (easeCurtain(openness) - 0.75) / 0.25);

  return (
    <g clipPath={`url(#${id}-clip)`} mask={`url(#${id}-fade)`}>
      <defs>
        <linearGradient id={`${id}-fold`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={VELVET.dark} />
          <stop offset=".14" stopColor={VELVET.mid} />
          <stop offset=".26" stopColor={VELVET.light} />
          <stop offset=".31" stopColor={VELVET.hi} />
          <stop offset=".40" stopColor={VELVET.light} />
          <stop offset=".56" stopColor={VELVET.mid} />
          <stop offset=".64" stopColor={VELVET.dark} />
          <stop offset=".80" stopColor={VELVET.mid} />
          <stop offset="1" stopColor={VELVET.dark} />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".07" />
          <stop offset=".45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={`${id}-valance`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={VELVET.mid} />
          <stop offset="1" stopColor={VELVET.dark} />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f6dc8c" />
          <stop offset=".5" stopColor="#b8892f" />
          <stop offset="1" stopColor="#f0cf75" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-20%" y="-5%" width="140%" height="110%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#000" floodOpacity=".6" />
        </filter>
        <linearGradient id={`${id}-fade-ramp`} x1="0" x2="0" y1="0" y2="1">
          <stop offset={fade} stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-fade`}>
          <rect x={x} y={y} width={width} height={height} fill={`url(#${id}-fade-ramp)`} />
        </mask>
        <clipPath id={`${id}-clip`}>
          <rect x={x} y={y} width={width} height={height + 40} rx={radius} />
        </clipPath>
      </defs>
      {[false, true].map((mirror) => {
        const tieCenter = mirror ? x + width - shape.tie.reach / 2 : x + shape.tie.reach / 2;
        return (
          <g key={mirror ? "right" : "left"}>
            <g filter={`url(#${id}-shadow)`}>
              {shape.bands.map((band, index) => (
                <polygon key={index} points={toPoints(band, mirror, width, x, y)} fill={`url(#${id}-fold)`} />
              ))}
              <polygon
                points={toPoints([[0, 0], ...shape.edge, [0, height]], mirror, width, x, y)}
                fill={`url(#${id}-shade)`}
              />
              <polyline
                points={toPoints(shape.edge, mirror, width, x, y)}
                fill="none"
                stroke="rgba(255,190,200,.25)"
                strokeWidth="1"
              />
            </g>
            {tieOpacity > 0 && (
              <rect
                x={mirror ? x + width - shape.tie.reach - 4 : x - 4}
                y={y + shape.tie.y - 4}
                width={shape.tie.reach + 8}
                height="8"
                rx="4"
                fill={`url(#${id}-gold)`}
                opacity={tieOpacity}
                transform={`rotate(${mirror ? 8 : -8} ${tieCenter} ${y + shape.tie.y})`}
              />
            )}
          </g>
        );
      })}
      <path d={valance} fill={`url(#${id}-valance)`} filter={`url(#${id}-shadow)`} />
      <rect x={x} y={y + valanceHeight * 0.5} width={width} height="1.5" fill={`url(#${id}-gold)`} opacity=".8" />
    </g>
  );
}

/**
 * Theater mode, shown rather than labelled: while it is on, the bowl sits on a
 * stage between two curtains.
 *
 * Holding to draw closes them at the pace the button fills, and letting go
 * early opens them again. When the hold completes the closed curtains grow to
 * fill the screen and part on the draw reveal, staying tied back at its edges
 * until the movie opens. Turning theater mode on drops them in and parts them;
 * turning it off closes them and lifts them away. A page that loads with it
 * already on shows them open, without the ceremony.
 *
 * Decoration only: hidden from assistive technology, never in the way of a
 * tap, and still under reduced motion.
 */
export default function TheaterCurtains({ enabled, holdState = "idle", isDrawing = false }) {
  const stageRef = useRef(null);
  const size = useElementSize(stageRef);
  const reducedMotion = prefersReducedMotion();
  const [openness, animateOpenness] = useTween(1);
  const [drop, animateDrop] = useTween(enabled ? 0 : 1);
  const wasEnabled = useRef(enabled);

  // On and off.
  useEffect(() => {
    if (wasEnabled.current === enabled) return;
    wasEnabled.current = enabled;
    const ms = (value) => (reducedMotion ? 0 : value);
    if (enabled) {
      animateOpenness(0, 0);
      animateDrop(0, ms(DROP_MS)).then(() => animateOpenness(1, ms(PART_MS)));
    } else {
      animateOpenness(0, ms(CLOSE_MS)).then(() => animateDrop(1, ms(DROP_MS)));
    }
  }, [enabled, reducedMotion, animateDrop, animateOpenness]);

  // The hold, and the draw it starts. Only a change in either moves the
  // curtains here, so turning theater mode on is left to finish its own entrance.
  const lastMotion = useRef({ holdState, isDrawing });
  useEffect(() => {
    const changed = lastMotion.current.holdState !== holdState || lastMotion.current.isDrawing !== isDrawing;
    lastMotion.current = { holdState, isDrawing };
    if (!changed || !enabled) return;
    if (isDrawing) {
      // The screen-wide pair takes over; this pair waits, open, for the page's return.
      animateOpenness(1, 0);
      return;
    }
    if (holdState === "holding") animateOpenness(0, reducedMotion ? 0 : HOLD_TO_DRAW_MS, (t) => t);
    else animateOpenness(1, reducedMotion ? 0 : REOPEN_MS);
  }, [enabled, holdState, isDrawing, reducedMotion, animateOpenness]);

  const hidden = drop >= 1 || isDrawing;
  return (
    <>
      <div ref={stageRef} className="theater-curtains" aria-hidden="true">
        {!hidden && size.width > 0 && (
          <svg width={size.width} height={size.height} style={{ transform: `translateY(${(-drop * 102).toFixed(1)}%)` }}>
            <CurtainArt
              rect={{ x: 0, y: 0, width: size.width, height: size.height }}
              openness={openness}
              spread={0}
              radius={22}
              fade={0.78}
            />
          </svg>
        )}
      </div>
      {enabled && isDrawing && !reducedMotion && <ScreenCurtains stageRef={stageRef} />}
    </>
  );
}

// The same curtains over the whole screen for the draw: shut where the bowl was,
// grown to the screen's edges, then parted on the reveal.
function ScreenCurtains({ stageRef }) {
  const [origin, setOrigin] = useState(null);
  const [viewport] = useState(() => ({ width: window.innerWidth || 390, height: window.innerHeight || 844 }));
  const [spread, animateSpread] = useTween(0);
  const [openness, animateOpenness] = useTween(0);

  // Measured on the next frame, where the page's own pair stood a moment ago.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOrigin(stageRef.current?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 });
      animateSpread(1, GROW_MS).then(() => animateOpenness(1, REVEAL_PART_MS));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stageRef, animateSpread, animateOpenness]);

  if (!origin) return null;
  const from = origin;
  const rect = {
    x: from.left * (1 - spread),
    y: from.top * (1 - spread),
    width: from.width + (viewport.width - from.width) * spread,
    height: from.height + (viewport.height - from.height) * spread,
  };
  return createPortal(
    <svg className="theater-curtains-screen" aria-hidden="true" width={viewport.width} height={viewport.height}>
      <CurtainArt rect={rect} openness={openness} spread={spread} radius={22 * (1 - spread)} fade={0.78 + 0.2 * spread} />
    </svg>,
    document.body
  );
}

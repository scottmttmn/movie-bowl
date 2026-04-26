import { useEffect, useState } from "react";

const PHASES = [
  { name: "enter", durationMs: 220 },
  { name: "shuffle", durationMs: 520 },
  { name: "lift", durationMs: 260 },
  { name: "finish", durationMs: 200 },
];

export default function DrawAnimationModal() {
  const [phase, setPhase] = useState("enter");

  useEffect(() => {
    const timeouts = [];
    let elapsedMs = 0;

    PHASES.slice(1).forEach(({ name, durationMs }, index) => {
      elapsedMs += PHASES[index].durationMs;
      timeouts.push(
        window.setTimeout(() => {
          setPhase(name);
        }, elapsedMs)
      );
      void durationMs;
    });

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, []);

  return (
    <div className="draw-animation-overlay" role="status" aria-live="polite" data-phase={phase}>
      <div className="draw-animation-veil" aria-hidden="true" />
      <div className="draw-animation-spotlight" aria-hidden="true" />
      <div className="draw-animation-stage" aria-hidden="true">
        <div className="draw-stage-shadow" />
        <div className="draw-bowl" />
        <div className="draw-slip-stack draw-slip-stack-left" />
        <div className="draw-slip-stack draw-slip-stack-right" />
        <div className="draw-scroll">
          <div className="draw-scroll-roll" />
          <div className="draw-scroll-sheet">
            <span className="draw-scroll-line draw-scroll-line-short" />
            <span className="draw-scroll-line" />
            <span className="draw-scroll-line draw-scroll-line-short" />
          </div>
        </div>
        <div className="draw-stage-glow" />
      </div>
      <div className="draw-animation-copy">
        <p className="draw-animation-kicker">Movie Bowl</p>
        <p className="draw-animation-label">Drawing a title from the bowl...</p>
      </div>
    </div>
  );
}

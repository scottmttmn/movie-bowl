import { useEffect, useState } from "react";

const PHASES = [
  { name: "enter", durationMs: 240 },
  { name: "shake", durationMs: 620 },
  { name: "pop", durationMs: 420 },
  { name: "finish", durationMs: 220 },
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
    <div className="sr-only" role="status" aria-live="polite" data-phase={phase}>
      Movie Bowl. Drawing a title from the bowl...
    </div>
  );
}

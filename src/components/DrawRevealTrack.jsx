import { useEffect, useState } from "react";
import {
  DRAW_REVEAL_PERSON_MS,
  getDrawRevealCopy,
  getDrawRevealPersonMs,
} from "../utils/drawReveal";

const MAX_VISIBLE_PEOPLE = 8;

function prefersReducedMotion() {
  // Missing matchMedia (jsdom, very old WebViews) reads as full motion.
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

// A long roster would wrap into a wall of names, so the chosen person is always
// kept and the rest are trimmed to fit. Order is preserved so the sweep reads
// as a pass along the row.
function getVisiblePeople(person) {
  if (person.people.length <= MAX_VISIBLE_PEOPLE) {
    return { visible: person.people, hiddenCount: 0 };
  }
  const others = person.people.filter((entry) => entry.key !== person.chosenKey);
  const keptKeys = new Set([
    person.chosenKey,
    ...others.slice(0, MAX_VISIBLE_PEOPLE - 1).map((entry) => entry.key),
  ]);
  return {
    visible: person.people.filter((entry) => keptKeys.has(entry.key)),
    hiddenCount: person.people.length - MAX_VISIBLE_PEOPLE,
  };
}

// Person-first sweeps along the row and slows onto the chosen person: a random
// pick, shown as one. Rotation never sweeps -- the person whose turn it is
// simply steps forward, because nothing about that choice was left to chance.
function usePersonHighlight(person, visible) {
  const chosenIndex = person ? visible.findIndex((entry) => entry.key === person.chosenKey) : -1;
  const [state, setState] = useState({ index: -1, landed: false });

  useEffect(() => {
    if (!person || chosenIndex < 0) return undefined;
    const durationMs = getDrawRevealPersonMs({ person }, { reducedMotion: prefersReducedMotion() });
    const timeouts = [];
    const schedule = (delay, next) => timeouts.push(window.setTimeout(() => setState(next), delay));

    if (person.mode === "turn" || durationMs < DRAW_REVEAL_PERSON_MS) {
      schedule(Math.round(durationMs * 0.4), { index: chosenIndex, landed: true });
    } else {
      // At least one full lap, ending on the chosen person, easing out so the
      // last few steps are the slow ones people actually watch.
      const steps = visible.length + chosenIndex + 1;
      const sweepMs = durationMs * 0.85;
      for (let step = 0; step < steps; step += 1) {
        const progress = (step + 1) / steps;
        const delay = Math.round(sweepMs * (1 - (1 - progress) ** 2));
        const index = step % visible.length;
        schedule(delay, { index, landed: step === steps - 1 });
      }
    }

    return () => timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [person, visible.length, chosenIndex]);

  return state;
}

export default function DrawRevealTrack({ method, reveal, titleShown = false }) {
  const person = reveal?.person || null;
  const { visible, hiddenCount } = person ? getVisiblePeople(person) : { visible: [], hiddenCount: 0 };
  const highlight = usePersonHighlight(person, visible);
  const copy = getDrawRevealCopy(reveal);

  let caption = `${method.revealPending}…`;
  if (reveal) {
    if (person && !highlight.landed) caption = `${method.revealPending}…`;
    else if (titleShown || !person) caption = [copy.person, copy.title].filter(Boolean).join(" · ");
    else caption = copy.person;
  }

  return (
    <div
      aria-hidden="true"
      className="draw-reveal-track"
      data-method={method.id}
      data-stage={!reveal ? "pending" : person && !highlight.landed ? "person" : "landed"}
    >
      {person && (
        <ol className={`draw-reveal-people ${person.mode === "turn" ? "is-turn" : ""}`}>
          {visible.map((entry, index) => {
            const isActive = highlight.index === index;
            const isChosen = highlight.landed && isActive;
            return (
              <li
                key={entry.key}
                className={`draw-reveal-person ${isActive ? "is-active" : ""} ${isChosen ? "is-chosen" : ""}`}
              >
                {entry.label}
              </li>
            );
          })}
          {hiddenCount > 0 && <li className="draw-reveal-person is-more">+{hiddenCount}</li>}
        </ol>
      )}
      <p className="draw-reveal-caption">{caption}</p>
    </div>
  );
}

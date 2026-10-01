import { getDrawMethod } from "../utils/drawMethods";

/**
 * How this bowl picks, as a mark rather than a sentence.
 *
 * One slip with one mark on it, because a television has to answer this at
 * about 40px and a phone at about 20: keeping the container constant and
 * changing only the mark leaves a single dominant shape at any size. The slip
 * is the bowl's own material -- the bowl is full of them -- rather than
 * borrowed iconography.
 *
 * Shared by the television and the bowl page, so both say the same thing about
 * the same bowl. `tvLabel` carries the meaning for anyone who cannot see it.
 */

// PROTOTYPE: three directions for Scott to pick from. Only the chosen set
// survives sign-off.
const MARK_SETS = {
  current: {
    person_first: (
      <>
        <circle cx="12" cy="10.2" r="2.2" fill="currentColor" />
        <path d="M7.9 16.4a4.1 4.1 0 0 1 8.2 0" />
      </>
    ),
    title_first: <path d="M7 9.5h10M7 12.5h10M7 15.5h6" />,
    rotation: (
      <>
        <path d="M8 13.4a4 4 0 1 1 1.5 3.1" />
        <path d="M11.7 6.6l-2.9 2 2.9 2z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // The reveal's own picture: one pile per person. Person-first lifts one pile
  // out of three; rotation carries a turn from pile to pile; title-first is a
  // single heap with no one's name on it.
  piles: {
    person_first: (
      <>
        <path d="M6.2 17.2h2.2M6.2 15.2h2.2M10.9 17.2h2.2M10.9 15.2h2.2M15.6 17.2h2.2M15.6 15.2h2.2" />
        <path d="M10.4 9.6l3.4-1.2.9 2.6-3.4 1.2z" fill="currentColor" />
      </>
    ),
    title_first: (
      <>
        <path d="M7 17h10M8.2 15h7.6M9.4 13h5.2M10.6 11h2.8" />
      </>
    ),
    rotation: (
      <>
        <path d="M6.2 17.2h2.2M6.2 15.2h2.2M10.9 17.2h2.2M10.9 15.2h2.2M15.6 17.2h2.2M15.6 15.2h2.2" />
        <path d="M7.9 12.2c.8-3.4 7.4-3.4 8.2 0" />
        <path d="M17.5 10.9l-1.3 1.9-1.8-1.3" />
      </>
    ),
  },
  // People, not paper. Person-first is three heads with one chosen; rotation
  // is the same three taking turns round a circle.
  heads: {
    person_first: (
      <>
        <circle cx="6.6" cy="12.6" r="1.3" />
        <circle cx="17.4" cy="12.6" r="1.3" />
        <circle cx="12" cy="9.6" r="2.1" fill="currentColor" />
        <path d="M9.4 16.4a2.6 2.6 0 0 1 5.2 0" />
      </>
    ),
    title_first: <path d="M7 9.5h10M7 12.5h10M7 15.5h6" />,
    rotation: (
      <>
        <circle cx="12" cy="7.9" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16.2" cy="15" r="1.5" />
        <circle cx="7.8" cy="15" r="1.5" />
        <path d="M14.8 9.2a4.9 4.9 0 0 1 2.1 3.2M14 17.6a4.9 4.9 0 0 1-4 0M7.1 12.4a4.9 4.9 0 0 1 2.1-3.2" />
      </>
    ),
  },
  // A music player's two buttons, which everyone already reads: shuffle means
  // chance, repeat means everyone in turn. Title-first stays a plain list.
  player: {
    person_first: (
      <>
        <path d="M6.5 9h2.2c3.7 0 3.4 6 7.2 6h1.6M6.5 15h2.2c1.4 0 2.2-.8 2.8-1.8M13.3 10.8c.6-1 1.4-1.8 2.6-1.8h1.6" />
        <path d="M16.3 7.7l1.5 1.3-1.5 1.3M16.3 13.7l1.5 1.3-1.5 1.3" />
      </>
    ),
    title_first: <path d="M7 9.5h10M7 12.5h10M7 15.5h6" />,
    rotation: (
      <>
        <path d="M7.2 12V10.6c0-.9.7-1.6 1.6-1.6h7.6M16.8 12v1.4c0 .9-.7 1.6-1.6 1.6H7.6" />
        <path d="M15 7.6l1.5 1.4-1.5 1.4M9 13.6L7.5 15 9 16.4" />
      </>
    ),
  },
};

export const DRAW_METHOD_MARK_SETS = Object.keys(MARK_SETS);

function readPrototypeSet() {
  // PROTOTYPE: ?marks=<set> picks a direction for the mockup captures.
  // Storage can be unavailable; the mark then shows the current set.
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("marks");
    if (fromQuery) window.sessionStorage.setItem("prototype:marks", fromQuery);
    return window.sessionStorage.getItem("prototype:marks") || "current";
  } catch {
    return "current";
  }
}

export default function DrawMethodMark({ drawMethod, className = "", markSet }) {
  const method = getDrawMethod(drawMethod);
  const set = MARK_SETS[markSet || readPrototypeSet()] || MARK_SETS.current;
  const mark = set[method.id];
  // A method the registry knows but this file has no mark for would otherwise
  // render an empty slip, which reads as a method rather than as a gap.
  if (!mark) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role="img"
      aria-label={method.tvLabel}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.8 6.1L18.5 3.9L20.7 18.2L6 20.4Z" fill="#e7dfd1" stroke="none" />
      <path d="M4.9 13.2L19.6 11" stroke="#c5b9a7" strokeWidth="0.55" />
      <g transform="rotate(-8 12 12)" stroke="#624c43" color="#624c43">
        {mark}
      </g>
    </svg>
  );
}

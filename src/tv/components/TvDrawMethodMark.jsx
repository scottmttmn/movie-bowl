import { getDrawMethod } from "../../utils/drawMethods";

/**
 * How this bowl picks, as a mark rather than a sentence.
 *
 * One slip with one mark on it, because a television has to answer this at
 * about 40px: keeping the container constant and changing only the mark leaves
 * a single dominant shape at any size. The slip is the bowl's own material --
 * the bowl is full of them -- rather than borrowed iconography.
 *
 * The mark answers what the draw reaches for first. A person means the draw
 * picks a contributor and then one of theirs; lines mean it picks a title from
 * the whole bowl; the cycle means the contributor is whoever has waited
 * longest rather than whoever chance lands on.
 *
 * It is not focusable. The draw method belongs to the bowl and is the owner's
 * to change, so on a television it is context rather than a control, and the
 * remote has nothing to do with it. `tvLabel` carries the meaning for anyone
 * who cannot see the mark.
 */
const MARKS = {
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
};

export default function TvDrawMethodMark({ drawMethod }) {
  const method = getDrawMethod(drawMethod);
  const mark = MARKS[method.id];
  // A method the registry knows but this file has no mark for would otherwise
  // render an empty slip, which reads as a method rather than as a gap.
  if (!mark) return null;

  return (
    <svg
      className="tv-method-mark"
      viewBox="0 0 24 24"
      role="img"
      aria-label={method.tvLabel}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      {mark}
    </svg>
  );
}

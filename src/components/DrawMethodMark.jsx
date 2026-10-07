import { getDrawMethod } from "../utils/drawMethods";

/**
 * How this bowl picks, as a mark rather than a sentence.
 *
 * One slip -- the bowl's own material -- with a music player's button printed
 * on it, because everyone already reads those: shuffle is chance, repeat is
 * everyone in turn. A title-first bowl is a bare shuffle over every title.
 * Person-first and rotation pick a person before a title, so their slip wears
 * a person badge on its corner, the way a profile picture sits on a message.
 * The badge is solid and outside the slip so it still reads as a person at
 * phone size, where a person printed small on the slip did not.
 *
 * Shared by the television and the bowl page so both say the same thing about
 * the same bowl. `tvLabel` carries the meaning for anyone who cannot see it,
 * unless `decorative` says the method is already named in text beside it.
 */
const SHUFFLE = (
  <>
    <path d="M6.5 9h2.2c3.7 0 3.4 6 7.2 6h1.6M6.5 15h2.2c1.4 0 2.2-.8 2.8-1.8M13.3 10.8c.6-1 1.4-1.8 2.6-1.8h1.6" />
    <path d="M16.3 7.7l1.5 1.3-1.5 1.3M16.3 13.7l1.5 1.3-1.5 1.3" />
  </>
);

const REPEAT = (
  <>
    <path d="M7.2 12V10.6c0-.9.7-1.6 1.6-1.6h7.6M16.8 12v1.4c0 .9-.7 1.6-1.6 1.6H7.6" />
    <path d="M15 7.6l1.5 1.4-1.5 1.4M9 13.6L7.5 15 9 16.4" />
  </>
);

const MARKS = {
  person_first: { glyph: SHUFFLE, personFirst: true },
  rotation: { glyph: REPEAT, personFirst: true },
  title_first: { glyph: SHUFFLE, personFirst: false },
};

export default function DrawMethodMark({ drawMethod, className = "", decorative = false }) {
  const method = getDrawMethod(drawMethod);
  const mark = MARKS[method.id];
  // A method the registry knows but this file has no mark for would otherwise
  // render an empty slip, which reads as a method rather than as a gap.
  if (!mark) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : method.tvLabel}
      aria-hidden={decorative || undefined}
      data-method={method.id}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The badged slip moves up and left so the badge fits the same box. */}
      <g transform={mark.personFirst ? "translate(-1.6 -1.6)" : undefined}>
        <path d="M3.8 6.1L18.5 3.9L20.7 18.2L6 20.4Z" fill="#e7dfd1" stroke="none" />
        <path d="M4.9 13.2L19.6 11" stroke="#c5b9a7" strokeWidth="0.55" />
        <g transform="rotate(-8 12 12)" stroke="#624c43">
          {mark.glyph}
        </g>
      </g>
      {mark.personFirst && (
        <g stroke="none" data-person-badge="">
          <circle cx="18.6" cy="18.6" r="5.1" fill="#64748b" stroke="#0f172a" strokeWidth="0.8" />
          <circle cx="18.6" cy="17" r="1.6" fill="#fff" />
          <path d="M15.8 21.6a2.8 2.8 0 0 1 5.6 0z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

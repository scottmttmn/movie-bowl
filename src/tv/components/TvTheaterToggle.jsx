import { clampTheaterTrailerCount, THEATER_TRAILER_COUNT_OPTIONS } from "../../utils/drawSettings";

function CurtainGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="tv-theater-glyph" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3h18" />
      <path d="M4 3c0 6 1 11 5 17H4z" />
      <path d="M20 3c0 6-1 11-5 17h5z" />
    </svg>
  );
}

/**
 * Theater mode on the television: the phone's curtain switch, and while it is
 * on, the preview count as a row of dots beside it.
 *
 * The dots are one focusable rather than four, because a remote has one
 * gesture: pressing walks 1, 2, 3, 4 and back to 1. The switch is how you leave
 * them again, so the pair is deliberately not a nav group, which would hold
 * focus at its ends.
 *
 * The number is a ceiling, not a promise. `buildTrailerQueue` resolves *up to*
 * that many and a bowl short on trailers yields fewer, so the label says "up
 * to" and the pre-roll counts the queue it actually built.
 */
export default function TvTheaterToggle({
  enabled,
  previewCount,
  isOverridden = false,
  isCountOverridden = false,
  onToggle,
}) {
  // An aria-label is the whole accessible name, so "set on this TV" has to be in
  // the label itself. There is no mark for the eye: a dot on every control that
  // differed from the account was distracting.
  const setHere = ", set on this TV";
  const count = clampTheaterTrailerCount(previewCount);
  const nextCount =
    THEATER_TRAILER_COUNT_OPTIONS[
      (THEATER_TRAILER_COUNT_OPTIONS.indexOf(count) + 1) % THEATER_TRAILER_COUNT_OPTIONS.length
    ];

  return (
    <span className="tv-theater-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Theater mode on" : "Theater mode"}${isOverridden ? setHere : ""}`}
        className="tv-theater-switch"
        data-on={enabled ? "true" : undefined}
        data-tv-focusable
        onClick={() => onToggle("theaterModeEnabled", !enabled)}
      >
        <CurtainGlyph />
      </button>
      {enabled && (
        <button
          type="button"
          aria-label={`Up to ${count} previews, change${isCountOverridden ? setHere : ""}`}
          className="tv-theater-count"
          data-tv-focusable
          onClick={() => onToggle("theaterTrailerCount", nextCount)}
        >
          {THEATER_TRAILER_COUNT_OPTIONS.map((option) => (
            <span
              key={option}
              aria-hidden="true"
              className="tv-theater-dot"
              data-filled={option <= count ? "true" : undefined}
            />
          ))}
        </button>
      )}
    </span>
  );
}

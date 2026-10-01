import { clampTheaterTrailerCount, THEATER_TRAILER_COUNT_OPTIONS } from "../utils/drawSettings";

function CurtainGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3h18" />
      <path d="M4 3c0 6 1 11 5 17H4z" />
      <path d="M20 3c0 6-1 11-5 17h5z" />
    </svg>
  );
}

/**
 * Theater mode on the phone and the laptop: a curtain button under the draw
 * button, and while it is on, one dot per preview beside it.
 *
 * It is a switch, not an action: it does not play previews, it says whether
 * tonight has them, and the curtains around the bowl are what it looks like
 * when it does. Armed, the pre-roll starts on its own once the pick is
 * revealed, because flipping this on the device in front of you is the consent
 * an after-the-draw offer could never collect.
 *
 * The dots are the count -- a choice about tonight, so it lives where tonight
 * is decided. Tapping one sets it. The number is a ceiling rather than a
 * promise: `buildTrailerQueue` resolves *up to* that many and a bowl short on
 * trailers yields fewer, so each dot's name says "up to" and the pre-roll
 * counts the queue it actually built.
 */
export default function TheaterModeToggle({ enabled, previewCount, onToggle, onPreviewCountChange }) {
  const count = clampTheaterTrailerCount(previewCount);

  return (
    <span className="theater-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Theater mode on" : "Theater mode"}
        className="theater-toggle-switch"
        data-on={enabled ? "true" : undefined}
        onClick={() => onToggle(!enabled)}
      >
        <CurtainGlyph />
      </button>
      {enabled && (
        <span role="radiogroup" aria-label="Previews before the movie" className="theater-toggle-count">
          {THEATER_TRAILER_COUNT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === count}
              aria-label={option === 1 ? "Up to 1 preview" : `Up to ${option} previews`}
              className="theater-toggle-dot"
              data-filled={option <= count ? "true" : undefined}
              onClick={() => onPreviewCountChange(option)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

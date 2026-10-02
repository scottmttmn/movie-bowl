import { useRef } from "react";
import { clampTheaterTrailerCount, THEATER_TRAILER_COUNT_OPTIONS } from "../utils/drawSettings";

function PreviewsGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="12.5" cy="6.5" r="2.5" />
      <rect x="3" y="10" width="13" height="9" rx="1.5" />
      <path d="M16 13.5l5-2.5v7l-5-2.5" />
    </svg>
  );
}

/**
 * Theater mode on the phone and the laptop: one plain row under the draw
 * button, and while it is on, a 1-4 picker for how many previews play.
 *
 * Plain on purpose. The usual night is drawn on a phone and watched on a
 * television, so here this is a setting people glance past rather than the
 * show itself -- the TV is where the curtains hang. It is a switch, not an
 * action: armed, the pre-roll starts on its own once the pick is revealed,
 * because flipping this on the device in front of you is the consent an
 * after-the-draw offer could never collect.
 *
 * The count is a ceiling rather than a promise: `buildTrailerQueue` resolves
 * *up to* that many and a bowl short on trailers yields fewer, so each
 * option's name says "up to" and the pre-roll counts the queue it built.
 */
export default function TheaterModeToggle({ enabled, previewCount, onToggle, onPreviewCountChange }) {
  const count = clampTheaterTrailerCount(previewCount);
  const group = useRef(null);

  // A radio group is one stop for Tab, and the arrows move the choice within it.
  const handleKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const options = THEATER_TRAILER_COUNT_OPTIONS;
    const next = options[(options.indexOf(count) + step + options.length) % options.length];
    onPreviewCountChange(next);
    group.current?.querySelector(`[data-option="${next}"]`)?.focus();
  };

  return (
    <div className="theater-toggle" data-on={enabled ? "true" : undefined}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className="theater-toggle-row"
        onClick={() => onToggle(!enabled)}
      >
        <PreviewsGlyph />
        <span className="flex-1 text-left">Previews first</span>
        <span className="theater-toggle-track" aria-hidden="true">
          <span />
        </span>
      </button>
      {enabled && (
        <div
          ref={group}
          role="radiogroup"
          aria-label="Previews before the movie"
          className="theater-toggle-count"
          onKeyDown={handleKeyDown}
        >
          {THEATER_TRAILER_COUNT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === count}
              tabIndex={option === count ? 0 : -1}
              data-option={option}
              aria-label={option === 1 ? "Up to 1 preview" : `Up to ${option} previews`}
              className="theater-toggle-option"
              onClick={() => onPreviewCountChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

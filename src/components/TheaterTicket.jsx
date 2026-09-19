import { clampTheaterTrailerCount, THEATER_TRAILER_COUNT_OPTIONS } from "../utils/drawSettings";

/**
 * Theater mode on the phone and the laptop, as the same ticket the television
 * wears (`src/tv/components/TvTheaterTicket.jsx`).
 *
 * It is a switch, not an action: it does not play previews, it says whether
 * tonight has them. That distinction is why this can sit on the bowl page at
 * all -- a "Play previews" button would advertise a feature and duplicate the
 * setting, while a state control simply reports one. Armed, the pre-roll starts
 * on its own once the pick is revealed, because flipping this on the device in
 * front of you is the consent an after-the-draw offer could never collect.
 *
 * The stub is the count while the ticket is on, and it tears off as its own
 * button: a tap walks 1, 2, 3, 4 and back to 1. That is the whole control --
 * the number no longer lives in Settings, because it is a choice about tonight
 * and belongs where tonight is decided. Cycling rather than a menu is what
 * makes it fit a stub, and what lets the television press it with one button.
 *
 * The number is a ceiling rather than a promise. `buildTrailerQueue` resolves
 * *up to* that many and a bowl short on trailers yields fewer, so the stub
 * prints the bare number while the label says "up to" and the pre-roll counts
 * the queue it actually built.
 *
 * No divergence mark here, unlike the television's. That mark reports the
 * device disagreeing with the account, and on the web theater mode is always
 * off underneath, so it would light whenever the ticket is on and never
 * otherwise -- restating the switch beside it rather than reporting anything.
 */
export default function TheaterTicket({ enabled, previewCount, onToggle, onPreviewCountChange }) {
  const count = clampTheaterTrailerCount(previewCount);
  const nextCount =
    THEATER_TRAILER_COUNT_OPTIONS[
      (THEATER_TRAILER_COUNT_OPTIONS.indexOf(count) + 1) % THEATER_TRAILER_COUNT_OPTIONS.length
    ];

  return (
    <span className="theater-ticket-group">
      {enabled && (
        <button
          type="button"
          aria-label={`Up to ${count} previews, change`}
          className="theater-ticket"
          data-on="true"
          onClick={() => onPreviewCountChange(nextCount)}
        >
          <span className="theater-ticket-face theater-ticket-face-stub">
            <span aria-hidden="true" className="theater-ticket-count">
              {count}
            </span>
          </span>
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Theater mode on" : "Theater mode"}
        className="theater-ticket"
        data-on={enabled ? "true" : undefined}
        onClick={() => onToggle(!enabled)}
      >
        <span className={`theater-ticket-face${enabled ? " theater-ticket-face-body" : ""}`}>
          {!enabled && (
            <span aria-hidden="true" className="theater-ticket-stub">
              Off
            </span>
          )}
          <span aria-hidden="true">Theater mode</span>
        </span>
      </button>
    </span>
  );
}

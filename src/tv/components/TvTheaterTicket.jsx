import { clampTheaterTrailerCount, THEATER_TRAILER_COUNT_OPTIONS } from "../../utils/drawSettings";

/**
 * Theater mode, as a ticket.
 *
 * It is the only setting on this screen about the occasion rather than about
 * filtering, and wearing the same pill as the filters it read as one of them.
 * A ticket is the bowl's own material -- the bowl is full of paper slips, and
 * this is the same paper, torn -- so it reads as not-like-the-other-controls
 * from across a room without needing a label to say so.
 *
 * On, the stub is the preview count and tears off into its own focusable:
 * pressing it walks 1, 2, 3, 4 and back to 1, which is the one gesture a remote
 * has. The count used to be the phone's alone, printed nowhere here because
 * nobody in the room could act on it; it is a device override now, so the room
 * can.
 *
 * The number is a ceiling, not a promise. `buildTrailerQueue` resolves *up to*
 * that many and a bowl short on trailers yields fewer, so the stub prints the
 * bare number while its label says "up to" and the pre-roll counts the queue it
 * actually built.
 */
export default function TvTheaterTicket({
  enabled,
  previewCount,
  isOverridden = false,
  isCountOverridden = false,
  onToggle,
}) {
  // An aria-label is the whole accessible name, so a divergence mark written as
  // sr-only text inside the button is never read: it has to be in the label
  // itself. The mark stays for the eye.
  const setHere = ", set on this TV";
  const count = clampTheaterTrailerCount(previewCount);
  const nextCount =
    THEATER_TRAILER_COUNT_OPTIONS[
      (THEATER_TRAILER_COUNT_OPTIONS.indexOf(count) + 1) % THEATER_TRAILER_COUNT_OPTIONS.length
    ];

  return (
    <span className="tv-ticket-group">
      {enabled && (
        <button
          type="button"
          aria-label={`Up to ${count} previews, change${isCountOverridden ? setHere : ""}`}
          className="tv-ticket"
          data-on="true"
          data-tv-focusable
          onClick={() => onToggle("theaterTrailerCount", nextCount)}
        >
          <span className="tv-ticket-face tv-ticket-face-stub">
            <span aria-hidden="true" className="tv-ticket-count">
              {count}
            </span>
            {isCountOverridden && <span aria-hidden="true" className="tv-rail-diverged" />}
          </span>
        </button>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Theater mode on" : "Theater mode"}${
          isOverridden ? setHere : ""
        }`}
        className="tv-ticket"
        data-on={enabled ? "true" : undefined}
        data-tv-focusable
        onClick={() => onToggle("theaterModeEnabled", !enabled)}
      >
        {/* The perforations are a mask, and a mask clips everything the element
            paints -- including an outer box-shadow, which is where this app's
            focus ring lives. Masking a face inside the button instead leaves
            the button itself free to wear the same ring as every other
            control. */}
        <span className={`tv-ticket-face${enabled ? " tv-ticket-face-body" : ""}`}>
          {!enabled && (
            <span aria-hidden="true" className="tv-ticket-stub">
              Off
            </span>
          )}
          <span aria-hidden="true" className="tv-ticket-name">
            Theater mode
          </span>
          {isOverridden && <span aria-hidden="true" className="tv-rail-diverged" />}
        </span>
      </button>
    </span>
  );
}

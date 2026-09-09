import { clampTheaterTrailerCount } from "../../utils/drawSettings";

/**
 * Theater mode, as a ticket.
 *
 * It is the only setting on this screen about the occasion rather than about
 * filtering, and wearing the same pill as the filters it read as one of them.
 * A ticket is the bowl's own material -- the bowl is full of paper slips, and
 * this is the same paper, torn -- so it reads as not-like-the-other-controls
 * from across a room without needing a label to say so.
 *
 * The count is what the phone set. `theaterTrailerCount` is deliberately not
 * in TV_OVERRIDABLE_SETTINGS: choosing between one and four previews is a
 * preference, not a decision the room makes on the night.
 */
export default function TvTheaterTicket({ enabled, trailerCount, isOverridden = false, onToggle }) {
  const previews = clampTheaterTrailerCount(trailerCount);
  const label = enabled
    ? `Theater mode on: ${previews} previews before the reveal`
    : "Theater mode";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      className="tv-ticket"
      data-on={enabled ? "true" : undefined}
      data-tv-focusable
      onClick={() => onToggle("theaterModeEnabled", !enabled)}
    >
      <span aria-hidden="true" className="tv-ticket-stub">
        {enabled ? `${previews} previews` : "Off"}
      </span>
      <span aria-hidden="true" className="tv-ticket-name">
        Theater mode
      </span>
      {isOverridden && (
        <>
          <span aria-hidden="true" className="tv-rail-diverged" />
          <span className="sr-only">set on this TV</span>
        </>
      )}
    </button>
  );
}

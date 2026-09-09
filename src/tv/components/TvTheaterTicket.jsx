/**
 * Theater mode, as a ticket.
 *
 * It is the only setting on this screen about the occasion rather than about
 * filtering, and wearing the same pill as the filters it read as one of them.
 * A ticket is the bowl's own material -- the bowl is full of paper slips, and
 * this is the same paper, torn -- so it reads as not-like-the-other-controls
 * from across a room without needing a label to say so.
 *
 * The stub says on or off and not how many previews. The count is the phone's
 * to set -- `theaterTrailerCount` is deliberately not in
 * TV_OVERRIDABLE_SETTINGS -- so printing it here offered a number nobody in
 * the room could act on. Worse, it was a number this control cannot know:
 * buildTrailerQueue resolves *up to* that many, and a bowl short on trailers
 * yields fewer, so a ticket promising three could be followed by a pre-roll
 * announcing one. The pre-roll counts the queue it actually built, which is
 * where the number belongs.
 */
export default function TvTheaterTicket({ enabled, isOverridden = false, onToggle }) {
  const label = enabled ? "Theater mode on" : "Theater mode";

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
      {/* The perforations are a mask, and a mask clips everything the element
          paints -- including an outer box-shadow, which is where this app's
          focus ring lives. Masking a face inside the button instead leaves the
          button itself free to wear the same ring as every other control. */}
      <span className="tv-ticket-face">
        <span aria-hidden="true" className="tv-ticket-stub">
          {enabled ? "On" : "Off"}
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
      </span>
    </button>
  );
}

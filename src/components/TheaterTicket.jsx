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
 * The stub says on or off and never the preview count. The count is the account's
 * to set and lives in Settings, and `buildTrailerQueue` resolves *up to* that
 * many -- a bowl short on trailers yields fewer -- so a ticket promising three
 * could be followed by a pre-roll announcing one.
 *
 * No divergence mark here, unlike the television's. That mark reports the device
 * disagreeing with the account, and on the web the base is always off, so it
 * would light whenever the ticket is on and never otherwise -- restating the
 * switch beside it rather than reporting anything.
 */
export default function TheaterTicket({ enabled, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Theater mode on" : "Theater mode"}
      className="theater-ticket"
      data-on={enabled ? "true" : undefined}
      onClick={() => onToggle(!enabled)}
    >
      <span className="theater-ticket-face">
        <span aria-hidden="true" className="theater-ticket-stub">
          {enabled ? "On" : "Off"}
        </span>
        <span aria-hidden="true">Theater mode</span>
      </span>
    </button>
  );
}

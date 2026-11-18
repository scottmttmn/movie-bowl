import BowlIllustration from "../../components/BowlIllustration";

// Here or not, the way the phone's sheet shows it: a filled rose face for
// someone on the couch, a gray one for someone who isn't. Nothing to read.
function TvHereFace({ row, here, onToggle }) {
  return (
    <button
      type="button"
      className="tv-whos-here-face"
      data-here={here ? "true" : "false"}
      data-tv-focusable
      data-tv-nav-group="whos-here-faces"
      aria-pressed={here}
      aria-label={`${row.name}${row.isYou ? " (you)" : ""} is here`}
      onClick={() => onToggle(row.key)}
    >
      <span className="tv-whos-here-initial" aria-hidden="true">
        {row.initial}
        <span className="tv-whos-here-check">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </span>
      <span className="tv-whos-here-name" aria-hidden="true">{row.name}</span>
    </button>
  );
}

/**
 * The television's who's-here panel: pressing Draw asks who is in the room
 * before it draws, which is why it replaces the old "Draw a movie?" screen
 * rather than following it. Faces in a row, OK to check one in or out, and
 * focus starts on Draw so OK twice draws for everyone. "Don't ask again" is
 * kept on this television, not the account: whoever holds the remote is not
 * the person it is signed in as.
 */
export default function TvWhosHerePanel({
  rows,
  awayKeys,
  onToggle,
  skipAsk,
  onSkipAskChange,
  canDraw,
  onDraw,
  isLoading = false,
  loadFailed = false,
}) {
  const away = new Set(awayKeys || []);
  return (
    <div className="tv-dialog-backdrop" role="presentation">
      <section
        className="tv-dialog tv-whos-here"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-whos-here-title"
      >
        <BowlIllustration className="tv-dialog-bowl" />
        <h2 id="tv-whos-here-title">Who&apos;s here?</h2>
        {/* Without a roster there are no faces to check out, so Draw draws
            for everyone; Back and Draw again asks for the roster again. */}
        {loadFailed ? (
          <p className="tv-whos-here-failed">Couldn&apos;t load who&apos;s in this bowl.</p>
        ) : (
          <div className="tv-whos-here-faces" aria-busy={isLoading ? "true" : undefined}>
            {rows.map((row) => (
              <TvHereFace key={row.key} row={row} here={!away.has(row.key)} onToggle={onToggle} />
            ))}
          </div>
        )}
        <div className="tv-dialog-actions">
          <button
            type="button"
            className="tv-button tv-button-quiet tv-whos-here-skip"
            data-tv-focusable
            data-tv-nav-group="whos-here-actions"
            aria-pressed={skipAsk}
            onClick={() => onSkipAskChange(!skipAsk)}
          >
            <span className="tv-whos-here-box" data-checked={skipAsk ? "true" : "false"} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            Don&apos;t ask again
          </button>
          <button
            type="button"
            className="tv-button tv-button-primary"
            data-tv-focusable
            data-tv-nav-group="whos-here-actions"
            data-tv-autofocus="true"
            // Dimmed rather than disabled while the roster settles: a disabled
            // button cannot take focus, so the panel would open on "Don't ask
            // again" and the second OK would change the setting, not draw.
            aria-disabled={canDraw ? undefined : "true"}
            onClick={() => {
              if (canDraw) onDraw();
            }}
          >
            Draw
          </button>
        </div>
      </section>
    </div>
  );
}

import { getPosterUrl } from "../../utils/getPosterUrl";
import TvStreamingRail from "./TvStreamingRail";

const MAX_POSTERS_PER_BOWL = 3;

/**
 * What the draw is working from, as a screen of its own.
 *
 * The resting stage keeps one target, so everything that shapes the pool lives
 * here instead: which bowls are in, and how hard streaming narrows them. A
 * television is good at a list that owns the screen and bad at a column of
 * controls beside the thing you came to press, which is what the rejected
 * exploration tried.
 *
 * Bowls read as their posters rather than their numbers. At ten feet a stack of
 * covers says "this is the one with the westerns in it" faster than a count
 * does, and the count is still there for the person who wants it.
 */
export default function TvSoloScopeSheet({
  bowls = [],
  selectedBowlIds = [],
  postersByBowl = {},
  services = [],
  streamingMode = "off",
  topService = null,
  isStreamingOverridden = false,
  onToggleBowl,
  onSelectAllBowls,
  onChangeStreamingMode,
  onClose,
}) {
  const selected = new Set(selectedBowlIds);
  const isEveryBowlSelected = bowls.length > 0 && selected.size === bowls.length;

  return (
    <div className="tv-dialog-backdrop" role="presentation">
      <section
        className="tv-solo-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-solo-sheet-title"
      >
        <header className="tv-solo-sheet-head">
          <p className="tv-kicker">Drawing from</p>
          <h2 id="tv-solo-sheet-title">Your bowls</h2>
        </header>

        <ul className="tv-solo-sheet-bowls" data-tv-nav-region="solo-sheet-bowls">
          {bowls.map((bowl) => {
            const isSelected = selected.has(bowl.id);
            const posters = (postersByBowl[bowl.id] || []).slice(0, MAX_POSTERS_PER_BOWL);

            return (
              <li key={bowl.id}>
                <button
                  type="button"
                  className="tv-solo-sheet-bowl"
                  aria-pressed={isSelected}
                  data-selected={isSelected ? "true" : undefined}
                  data-tv-focusable
                  onClick={() => onToggleBowl?.(bowl.id)}
                >
                  <span aria-hidden="true" className="tv-solo-sheet-posters">
                    {posters.length > 0 ? (
                      posters.map((movie) => (
                        <img
                          key={movie.id}
                          className="tv-solo-sheet-poster"
                          src={getPosterUrl(movie, "w154")}
                          alt=""
                        />
                      ))
                    ) : (
                      <span className="tv-solo-sheet-poster tv-solo-sheet-poster-empty" />
                    )}
                  </span>
                  <span className="tv-solo-sheet-bowl-name">{bowl.name}</span>
                  <span className="tv-solo-sheet-bowl-count">
                    {bowl.titleCount} {bowl.titleCount === 1 ? "title" : "titles"}
                  </span>
                  <span aria-hidden="true" className="tv-solo-sheet-check" />
                </button>
              </li>
            );
          })}
        </ul>

        {services.length > 0 && (
          <div className="tv-solo-sheet-streaming" data-tv-nav-region="solo-sheet-streaming">
            <p className="tv-kicker">Streaming</p>
            <TvStreamingRail
              services={services}
              mode={streamingMode}
              topService={topService}
              isOverridden={isStreamingOverridden}
              onChange={onChangeStreamingMode}
            />
          </div>
        )}

        <div className="tv-dialog-actions" data-tv-nav-region="solo-sheet-actions">
          <button
            type="button"
            className="tv-button tv-button-quiet"
            data-tv-focusable
            data-tv-nav-group="solo-sheet-actions"
            disabled={isEveryBowlSelected}
            onClick={() => onSelectAllBowls?.()}
          >
            All bowls
          </button>
          <button
            type="button"
            className="tv-button tv-button-primary"
            data-tv-focusable
            data-tv-nav-group="solo-sheet-actions"
            data-tv-autofocus="true"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * A stand-in row of cards, the same size as the real ones.
 *
 * Its job is to occupy the space the strip is about to need. The dashboard used
 * to announce loading in a panel above the hero and show nothing where the
 * cards go, so arriving data moved the page twice: once when the panel was
 * removed and again when the strips grew into place. Reserving the height means
 * the content swaps in without anything else moving.
 *
 * Sized from MovieActionCard: a w-28 h-40 poster, a two-line title block and
 * the date line under it.
 */
export default function MovieStripSkeleton({ count = 4, label = "Loading movies…", scrollable = false }) {
  // A strip long enough to scroll carries a scrollbar under its cards, and a
  // skeleton that clipped instead grew by that much when the cards arrived.
  // Scrollable, it overflows the same way when it has as many cards to show.
  return (
    <div
      className={`movie-strip-skeleton flex gap-3 ${scrollable ? "overflow-x-auto" : "overflow-hidden"}`}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="inline-flex w-28 flex-shrink-0 flex-col" aria-hidden="true">
          <div className="skeleton-block h-40 w-28 rounded-xl" />
          {/* The card's own caption boxes -- a two-line title block and the
              date line -- so a card arriving is exactly as tall as this. */}
          <div className="mt-1 min-h-[2rem] pt-0.5">
            <div className="skeleton-block h-3 w-24 rounded" />
          </div>
          <p className="text-[11px]">
            <span className="skeleton-block inline-block h-2.5 w-16 rounded align-middle" />
          </p>
        </div>
      ))}
    </div>
  );
}

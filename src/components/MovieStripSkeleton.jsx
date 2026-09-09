/**
 * A stand-in row of cards, the same size as the real ones.
 *
 * Its job is to occupy the space the strip is about to need. The dashboard used
 * to announce loading in a panel above the hero and show nothing where the
 * cards go, so arriving data moved the page twice: once when the panel was
 * removed and again when the strips grew into place. Reserving the height means
 * the content swaps in without anything else moving.
 *
 * Sized from MovieActionCard: a w-28 h-40 poster with a caption under it.
 */
export default function MovieStripSkeleton({ count = 4, label = "Loading movies…" }) {
  return (
    <div className="movie-strip-skeleton flex gap-3 overflow-hidden" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="inline-flex w-28 flex-shrink-0 flex-col" aria-hidden="true">
          <div className="skeleton-block h-40 w-28 rounded-xl" />
          <div className="skeleton-block mt-2 h-3 w-24 rounded" />
          <div className="skeleton-block mt-1 h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

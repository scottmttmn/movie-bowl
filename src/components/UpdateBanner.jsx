// Sits in the page flow rather than floating: it appears once per deploy, and
// pushing the content down keeps it clear of the fixed nav and the offline
// banner instead of stacking overlays on top of each other.
export default function UpdateBanner() {
  return (
    <div className="page-container pt-4" data-testid="update-banner">
      <div
        role="status"
        aria-live="polite"
        className="status-warning flex flex-wrap items-center justify-between gap-3"
      >
        <span>A new version of Movie Bowl is ready.</span>
        {/* Deliberately not the guarded reload: an explicit tap always reloads. */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => window.location.reload()}
        >
          Update now
        </button>
      </div>
    </div>
  );
}

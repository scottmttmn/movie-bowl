import RestaurantSlip from "./RestaurantSlip";

const Icon = ({ d }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export default function RestaurantTonightSheet({ movie, addedByLabel, openLabel, onClose }) {
  const initial = (addedByLabel || "").trim().charAt(0).toUpperCase();
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${movie.title} Decorah IA`)}`;
  return (
    <div className="modal-overlay z-50" role="presentation">
      <div className="modal-surface flex max-h-[92dvh] w-full max-w-xl flex-col overflow-clip" role="dialog" aria-modal="true" aria-labelledby="tonight-restaurant-title">
        <div className="flex shrink-0 items-center justify-end px-5 py-3 sm:px-7 sm:py-4">
          <button type="button" className="icon-btn shrink-0" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-7 sm:px-7">
          <div className="grid grid-cols-[minmax(96px,1fr)_minmax(0,2fr)] items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6">
            <RestaurantSlip movie={movie} size="big" />
            <div className="min-w-0 py-1">
              <h2 id="tonight-restaurant-title" className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-3xl">{movie.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                {movie.cuisine && <span>{movie.cuisine}</span>}
                <span className="inline-flex items-center gap-1.5 text-emerald-300"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />{openLabel}</span>
              </div>
              {movie.note ? (
                <figure className="tonight-slip mt-3">
                  {initial && <span className="tonight-slip-avatar" title={addedByLabel}>{initial}</span>}
                  <blockquote>{movie.note}</blockquote>
                </figure>
              ) : addedByLabel ? (
                <p className="mt-3 text-sm text-slate-400">Added by <span className="text-slate-200">{addedByLabel}</span></p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2.5">
            {movie.reservable ? (
              <a className="btn btn-primary w-full" href={maps} target="_blank" rel="noreferrer">
                <Icon d={<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M9 15l2 2 4-4" /></>} />
                Reserve a table
              </a>
            ) : null}
            <div className="grid grid-cols-3 gap-2.5">
              <a className={`btn ${movie.reservable ? "btn-secondary" : "btn-primary"} flex-col gap-1 px-2 py-2.5 text-sm`} href={maps} target="_blank" rel="noreferrer">
                <Icon d={<><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>} />
                Directions
              </a>
              <a className="btn btn-secondary flex-col gap-1 px-2 py-2.5 text-sm" href={movie.website || "#"} target="_blank" rel="noreferrer">
                <Icon d={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>} />
                Website
              </a>
              <a className="btn btn-secondary flex-col gap-1 px-2 py-2.5 text-sm" href={movie.phone ? `tel:${movie.phone}` : "#"}>
                <Icon d={<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />} />
                Call
              </a>
            </div>
            <p className="pt-1 text-right text-[11px] text-slate-500">Google Maps</p>
          </div>
        </div>
      </div>
    </div>
  );
}

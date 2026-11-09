import { useEffect, useRef, useState } from "react";
import RestaurantSlip from "./RestaurantSlip";
import { getMovieAttributionLabel } from "../utils/drawBuckets";
import { describeOpenStatus, getRestaurantDirectionsUrl } from "../utils/restaurants";
import { getPlaceDetails as defaultGetPlaceDetails } from "../lib/placesSearch";

function Icon({ children }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const STATUS_TONES = {
  open: "text-emerald-300",
  closed: "text-slate-400",
  gone: "text-rose-300",
};
const DOT_TONES = {
  open: "bg-emerald-400",
  closed: "bg-slate-500",
  gone: "bg-rose-400",
};

function LinkIcon({ kind }) {
  if (kind === "website") {
    return (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </Icon>
    );
  }
  if (kind === "call") {
    return (
      <Icon>
        <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
      </Icon>
    );
  }
  return (
    <Icon>
      <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

// A restaurant slip opened: the drawn pick, or one from My Restaurants or Been
// there. It answers the one question left once a place is chosen, which is how
// to get there. The drawn pick alone asks Google for more -- whether it is
// open, Reserve, Website, Call and a photo -- because each lookup spends a
// monthly allowance and the draw is the moment that needs them.
export default function RestaurantSheet({
  slip,
  tonight = false,
  bowlId = null,
  getPlaceDetails = defaultGetPlaceDetails,
  onClose,
  onDelete = null,
  deleteLabel = "Remove from bowl",
  primaryActionLabel = null,
  onPrimaryAction = null,
  primaryActionNote = null,
}) {
  const closeButton = useRef(null);
  const [isWorking, setIsWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  const addedByLabel = getMovieAttributionLabel(slip);
  const initial = (addedByLabel || "").trim().charAt(0).toUpperCase();
  const directionsUrl = getRestaurantDirectionsUrl(slip);
  const lookupKey = tonight && bowlId && slip?.place_id ? `${bowlId}:${slip.place_id}` : null;
  // The answer is kept beside the lookup it answered, so a different slip
  // never shows the last one's hours while its own are on the way.
  const [place, setPlace] = useState({ key: null, details: null, photo: null });
  const placeAnswered = lookupKey !== null && place.key === lookupKey;
  const details = placeAnswered ? place.details : null;
  const photo = placeAnswered ? place.photo : null;
  const status = describeOpenStatus(details);
  const links = [
    directionsUrl && { key: "directions", label: "Directions", href: directionsUrl },
    details?.website && { key: "website", label: "Website", href: details.website },
    details?.phone && { key: "call", label: "Call", href: `tel:${details.phone}`, title: details.phoneLabel },
  ].filter(Boolean);

  useEffect(() => {
    if (!lookupKey) return undefined;
    const controller = new AbortController();
    getPlaceDetails({ placeId: slip.place_id, bowlId, photo: true, signal: controller.signal }).then((answer) => {
      if (controller.signal.aborted) return;
      setPlace({ key: lookupKey, details: answer?.details || null, photo: answer?.photo || null });
    });
    return () => controller.abort();
  }, [lookupKey, bowlId, slip?.place_id, getPlaceDetails]);

  useEffect(() => {
    closeButton.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const run = async (action) => {
    setActionError("");
    setIsWorking(true);
    try {
      const result = await action(slip);
      if (result && result.ok === false && result.message) setActionError(result.message);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="modal-overlay z-50" role="presentation">
      <div
        className="modal-surface flex max-h-[92dvh] w-full max-w-xl flex-col overflow-clip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurant-sheet-title"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-7 sm:py-4">
          {tonight ? <span aria-hidden="true" /> : <p className="eyebrow">Restaurant</p>}
          <button ref={closeButton} type="button" className="icon-btn shrink-0" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 pb-7 sm:px-7">
          {lookupKey && !placeAnswered && (
            <div aria-hidden="true" className="aspect-[16/9] w-full animate-pulse rounded-2xl bg-slate-800/70" />
          )}
          {photo && (
            <figure>
              <img
                src={photo.uri}
                alt={`${slip.title}, from Google Maps`}
                className="aspect-[16/9] w-full rounded-2xl object-cover"
                referrerPolicy="no-referrer"
              />
              {photo.author && (
                <figcaption className="mt-1 text-right text-xs text-slate-500">
                  Photo:{" "}
                  {photo.author.uri ? (
                    <a className="underline-offset-2 hover:underline" href={photo.author.uri} target="_blank" rel="noreferrer">
                      {photo.author.name}
                    </a>
                  ) : photo.author.name}
                </figcaption>
              )}
            </figure>
          )}
          <div className="grid grid-cols-[minmax(96px,1fr)_minmax(0,2fr)] items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6">
            <RestaurantSlip slip={slip} size="big" />
            <div className="min-w-0 py-1">
              <h2 id="restaurant-sheet-title" className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-3xl">
                {slip.title}
              </h2>
              {slip.cuisine && <p className="mt-2 text-sm text-slate-400">{slip.cuisine}</p>}
              {status && (
                <p className={`mt-1.5 flex items-center gap-2 text-sm font-medium ${STATUS_TONES[status.tone]}`}>
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONES[status.tone]}`} />
                  {status.text}
                </p>
              )}
              {slip.note ? (
                <figure className="tonight-slip mt-3">
                  {initial && <span className="tonight-slip-avatar" title={addedByLabel}>{initial}</span>}
                  <blockquote>{slip.note}</blockquote>
                </figure>
              ) : addedByLabel ? (
                <p className="mt-3 text-sm text-slate-400">Added by <span className="text-slate-200">{addedByLabel}</span></p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2.5">
            {details?.reserveUrl && (
              <a className="btn btn-primary w-full" href={details.reserveUrl} target="_blank" rel="noreferrer">
                <Icon>
                  <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                  <path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4" />
                </Icon>
                Reserve a table
              </a>
            )}
            {links.length === 1 && !details?.reserveUrl ? (
              <a className="btn btn-primary w-full" href={links[0].href} target="_blank" rel="noreferrer">
                <LinkIcon kind={links[0].key} />
                {links[0].label}
              </a>
            ) : links.length > 0 && (
              <div className={`grid gap-2.5 ${links.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {links.map((link) => (
                  <a
                    key={link.key}
                    className="btn btn-secondary flex-col gap-1 py-3 text-sm"
                    href={link.href}
                    title={link.title || undefined}
                    {...(link.key === "call" ? {} : { target: "_blank", rel: "noreferrer" })}
                  >
                    <LinkIcon kind={link.key} />
                    {link.label}
                  </a>
                ))}
              </div>
            )}
            {primaryActionLabel && onPrimaryAction && (
              <button type="button" className="btn btn-secondary w-full" disabled={isWorking} onClick={() => run(onPrimaryAction)}>
                {primaryActionLabel}
              </button>
            )}
            {primaryActionNote && <p className="text-sm text-slate-400">{primaryActionNote}</p>}
            {onDelete && (
              <button type="button" className="btn btn-ghost w-full text-sm text-rose-300" disabled={isWorking} onClick={() => run(onDelete)}>
                {deleteLabel}
              </button>
            )}
            {actionError && <p className="text-sm text-rose-300" role="alert">{actionError}</p>}
            {details && <p className="text-right text-xs text-slate-500">Google Maps</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

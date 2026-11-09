import { useEffect, useId, useRef, useState } from "react";
import RestaurantAddForm from "./RestaurantAddForm";
import { createPlacesSessionToken, searchPlaces as defaultSearchPlaces } from "../lib/placesSearch";
import { MAX_RESTAURANT_NAME_LENGTH } from "../utils/restaurants";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

// Adding to a restaurant bowl: search Google for the place, then confirm it on
// the slip, where the name can still be the adder's own. A place Google does
// not list, or a sheet with no search at all, is added by name on that same
// slip.
export default function RestaurantSearch({
  bowlName,
  initialQuery = "",
  disabled = false,
  pending = false,
  onSubmit,
  onDraftChange,
  feedback = null,
  searchPlaces = defaultSearchPlaces,
}) {
  const [query, setQuery] = useState(initialQuery);
  // Google's last answer and the search it answered. Results stay up while
  // the next keystroke's answer is on its way, and are only called empty once
  // that exact search came back with nothing.
  const [answer, setAnswer] = useState({ query: "", results: [] });
  // Once search answers that it is out (no key, Google down), the sheet stays
  // on adding by name rather than asking again on every keystroke.
  const [unavailable, setUnavailable] = useState(false);
  // Null while searching; a chosen place, or { name } for one added by name.
  const [slip, setSlip] = useState(null);
  const sessionToken = useRef(createPlacesSessionToken());
  const inputRef = useRef(null);
  const inputId = useId();
  const trimmed = query.trim();

  const searchable = trimmed.length >= MIN_QUERY_LENGTH;
  const results = searchable ? answer.results : [];
  const answeredEmpty = searchable && answer.query === trimmed && answer.results.length === 0;

  useEffect(() => {
    if (slip || unavailable || trimmed.length < MIN_QUERY_LENGTH) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const reply = await searchPlaces({ query: trimmed, sessionToken: sessionToken.current, signal: controller.signal });
      if (controller.signal.aborted) return;
      // No search to be had: the slip takes what was typed as the name.
      if (!reply.available) setUnavailable(true);
      else setAnswer({ query: trimmed, results: reply.results });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, slip, unavailable, searchPlaces]);

  const backToSearch = () => {
    setSlip(null);
    // A new search is a new session for Google.
    sessionToken.current = createPlacesSessionToken();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submit = async (entry) => {
    const result = await onSubmit(entry);
    // Added by name with no search: the form clears itself for the next one.
    if (result?.ok && !unavailable) {
      setQuery("");
      setAnswer({ query: "", results: [] });
      backToSearch();
    }
    return result;
  };

  if (unavailable || slip) {
    return (
      <div className="space-y-3">
        {slip && !unavailable && (
          <button type="button" className="btn btn-ghost -ml-2 text-sm" onClick={backToSearch}>
            ← Search again
          </button>
        )}
        <RestaurantAddForm
          // A new place starts a fresh slip rather than editing the last one.
          key={slip?.placeId || `name:${slip?.name ?? ""}`}
          bowlName={bowlName}
          initialName={slip ? slip.name : trimmed}
          initialCuisine={slip?.cuisine || null}
          placeId={slip?.placeId || null}
          autoFocusName={unavailable}
          disabled={disabled}
          pending={pending}
          onSubmit={submit}
          onDraftChange={onDraftChange}
          feedback={feedback}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">Search for a restaurant</label>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          className="input-field w-full pl-10"
          placeholder="Search restaurants"
          autoComplete="off"
          maxLength={MAX_RESTAURANT_NAME_LENGTH}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            onDraftChange?.();
          }}
        />
      </div>
      {results.length > 0 && (
        <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800" aria-label="Restaurants">
          {results.map((place) => {
            const detail = [place.cuisine, place.address].filter(Boolean).join(" · ");
            return (
              <li key={place.placeId} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-100">{place.name}</p>
                  {detail && <p className="truncate text-sm text-slate-400">{detail}</p>}
                </div>
                <button
                  type="button"
                  className="icon-btn h-11 w-11 shrink-0"
                  aria-label={`Add ${place.name}`}
                  disabled={disabled}
                  onClick={() => setSlip(place)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {answeredEmpty && (
        <p className="text-sm text-slate-400" role="status">No restaurants by that name.</p>
      )}
      {results.length > 0 && <p className="text-right text-xs text-slate-500">Google Maps</p>}
      {trimmed && (
        <button type="button" className="btn btn-ghost w-full text-sm" disabled={disabled} onClick={() => setSlip({ name: trimmed })}>
          Not listed? Add “{trimmed}” by name
        </button>
      )}
      {feedback}
    </div>
  );
}

import { useState } from "react";
import { CUISINES } from "./restaurant";

// Stand-in for Google Places Autocomplete + Details Pro.
const PLACES = [
  { name: "Magpie Coffeehouse", cuisine: "Cafe", area: "Water St, Decorah" },
  { name: "Mabe's Pizza", cuisine: "Pizza", area: "W Water St, Decorah" },
  { name: "McCaffrey's Dolce Vita", cuisine: "Italian", area: "Pleasant Hill Dr, Decorah" },
  { name: "Magnolia Kitchen", cuisine: "American", area: "Montgomery St, Decorah" },
];

export default function RestaurantAddSheet({ bowlName, onClose }) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState(false);
  const [cuisine, setCuisine] = useState(null);
  const results = query.trim().length >= 2
    ? PLACES.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  return (
    <div className="modal-overlay z-50" role="presentation" onClick={onClose}>
      <div className="modal-surface flex max-h-[92dvh] w-full max-w-lg flex-col overflow-clip" role="dialog" aria-modal="true" aria-labelledby="add-restaurant-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-6 sm:py-4">
          <h2 id="add-restaurant-title" className="text-lg font-semibold text-slate-100">Add to {bowlName}</h2>
          <button type="button" className="icon-btn shrink-0" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 pb-6 sm:px-6">
          <label className="relative block" htmlFor="rb-search">
            <span className="sr-only">Search restaurants</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input id="rb-search" className="input-field w-full pl-11" placeholder="Restaurant near Decorah" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {!manual && results.length > 0 && (
            <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800">
              {results.map((p) => (
                <li key={p.name} className="flex items-center gap-3 bg-slate-900/60 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-100">{p.name}</p>
                    <p className="truncate text-sm text-slate-400">{p.cuisine} · {p.area}</p>
                  </div>
                  <button type="button" className="icon-btn shrink-0" aria-label={`Add ${p.name}`}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!manual && results.length > 0 && <p className="text-right text-[11px] text-slate-500">Google Maps</p>}
          {manual ? (
            <div>
              <p className="text-sm font-medium text-slate-300">Cuisine</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cuisine">
                {CUISINES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cuisine === c} aria-label={c} onClick={() => setCuisine(c)} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${cuisine === c ? "border-rose-500 bg-rose-700 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary mt-5 w-full" disabled={!query.trim()}>Add to bowl</button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost w-full text-sm text-slate-400" onClick={() => setManual(true)}>
              Not listed? Add “{query.trim() || "it"}” by name
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

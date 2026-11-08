import { useState } from "react";
import { CUISINES } from "./restaurant";

export default function RestaurantAddSheet({ bowlName, onClose }) {
  const [name, setName] = useState("");
  const [cuisine, setCuisine] = useState(null);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="modal-overlay z-50" role="presentation" onClick={onClose}>
      <div className="modal-surface flex max-h-[92dvh] w-full max-w-lg flex-col overflow-clip" role="dialog" aria-modal="true" aria-labelledby="add-restaurant-title" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-6 sm:py-4">
          <h2 id="add-restaurant-title" className="text-lg font-semibold text-slate-100">Add to {bowlName}</h2>
          <button type="button" className="icon-btn shrink-0" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-6 sm:px-6">
          <label className="block text-sm font-medium text-slate-300" htmlFor="rb-name">
            Name
            <input id="rb-name" className="input-field mt-1.5 w-full" placeholder="Restaurant" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <p className="text-sm font-medium text-slate-300">Cuisine</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cuisine">
              {CUISINES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={cuisine === c} aria-label={c} onClick={() => setCuisine(c)} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${cuisine === c ? "border-rose-500 bg-rose-700 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-medium text-slate-300" htmlFor="rb-link">
            Booking link
            <input id="rb-link" className="input-field mt-1.5 w-full" inputMode="url" placeholder="OpenTable, Resy or their site" value={link} onChange={(e) => setLink(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-300" htmlFor="rb-note">
            Why it's in the bowl
            <textarea id="rb-note" rows={2} className="input-field mt-1.5 w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" className="btn btn-primary w-full" disabled={!name.trim()}>Add to bowl</button>
        </div>
      </div>
    </div>
  );
}

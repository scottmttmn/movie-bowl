import { useId, useState } from "react";
import { MAX_MOVIE_NOTE_LENGTH } from "../utils/movieNote";
import { MAX_RESTAURANT_NAME_LENGTH, RESTAURANT_CUISINES } from "../utils/restaurants";

// The slip a restaurant is added on: the place as the adder writes it
// (prefilled from Google when it came from search), one cuisine chip, and why
// it belongs in the bowl. A place from search carries its Google id, which is
// all of Google's answer the slip keeps.
export default function RestaurantAddForm({
  bowlName,
  initialName = "",
  initialCuisine = null,
  placeId = null,
  autoFocusName = false,
  disabled = false,
  pending = false,
  onSubmit,
  onDraftChange,
  feedback = null,
}) {
  const [name, setName] = useState(initialName);
  const [cuisine, setCuisine] = useState(initialCuisine);
  const [note, setNote] = useState("");
  const nameId = useId();
  const noteId = useId();
  const trimmedName = name.trim();
  const canSubmit = Boolean(trimmedName) && !disabled && !pending;

  const changed = (apply) => (value) => {
    apply(value);
    onDraftChange?.();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    const result = await onSubmit({
      title: trimmedName,
      cuisine,
      note,
      isCustomEntry: true,
      ...(placeId ? { place_id: placeId } : {}),
    });
    if (result?.ok) {
      setName("");
      setCuisine(null);
      setNote("");
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit} aria-label={`Add a restaurant to ${bowlName}`}>
      <div>
        <label htmlFor={nameId} className="mb-1 block text-sm font-medium text-slate-300">Restaurant</label>
        <input
          id={nameId}
          name="restaurant_name"
          className="input-field w-full"
          placeholder="La Rana Bistro"
          autoComplete="off"
          // Only when search gave out under the adder's fingers: the box they
          // were typing in has just become this one.
          autoFocus={autoFocusName}
          maxLength={MAX_RESTAURANT_NAME_LENGTH}
          value={name}
          disabled={disabled}
          onChange={(event) => changed(setName)(event.target.value)}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-300" id={`${nameId}-cuisine`}>Cuisine</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${nameId}-cuisine`}>
          {RESTAURANT_CUISINES.map((option) => {
            const selected = cuisine === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                // A second tap clears it: cuisine is optional, and a chip that
                // cannot be unpicked forces a guess.
                onClick={() => changed(setCuisine)(selected ? null : option)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  selected
                    ? "border-rose-500 bg-rose-700 text-white"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label htmlFor={noteId} className="mb-1 block text-sm font-medium text-slate-300">Why it's in the bowl (optional)</label>
        <textarea
          id={noteId}
          name="restaurant_note"
          className="input-field min-h-16 w-full"
          maxLength={MAX_MOVIE_NOTE_LENGTH}
          placeholder="Anniversary spot"
          value={note}
          disabled={disabled}
          onChange={(event) => changed(setNote)(event.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
        {pending ? "Adding…" : `Add to ${bowlName}`}
      </button>
      {feedback}
    </form>
  );
}

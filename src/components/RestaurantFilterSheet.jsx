import { OPEN_MODES, PICK_TIMES, getDefaultPick, getPickDays } from "../utils/restaurantHours";

const OPEN_OPTIONS = [
  { mode: OPEN_MODES.any, label: "Any time" },
  { mode: OPEN_MODES.now, label: "Now" },
  { mode: OPEN_MODES.tonight, label: "Tonight" },
  { mode: OPEN_MODES.pick, label: "Pick" },
];

function describeHours({ status, counts }) {
  if (status === "loading") return "Checking hours…";
  if (!counts) return "";
  if (counts.open === 0 && counts.closed === 0) return "No hours to go on, so nothing is left out";
  return [
    `${counts.open} open`,
    counts.closed > 0 && `${counts.closed} closed`,
    counts.unknown > 0 && `${counts.unknown} without hours`,
  ].filter(Boolean).join(" · ");
}

// When the group means to eat. People draw on Wednesday for Saturday, so the
// filter takes a day and time as readily as "now". It stays off until asked
// for and is not remembered: every answer is a lookup against a monthly
// allowance, and a time picked last week means nothing this week.
function OpenSection({ open }) {
  const { choice, onChange, status, counts } = open;
  const days = getPickDays();
  const description = choice.mode === OPEN_MODES.any ? "" : describeHours({ status, counts });
  return (
    <div className="mb-4 border-b border-slate-800 pb-4">
      <p className="flex items-center gap-2 font-semibold text-slate-100" id="restaurant-open-filter">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
        Open
      </p>
      <div
        className="mt-2 grid grid-cols-4 gap-1 rounded-xl border border-slate-700 bg-slate-950/60 p-1"
        role="radiogroup"
        aria-labelledby="restaurant-open-filter"
      >
        {OPEN_OPTIONS.map((option) => {
          const checked = choice.mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={checked}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                checked ? "bg-rose-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
              onClick={() => onChange(option.mode === OPEN_MODES.pick ? getDefaultPick() : { mode: option.mode })}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {choice.mode === OPEN_MODES.pick && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            className="input-field"
            aria-label="Day"
            value={choice.day}
            onChange={(event) => onChange({ ...choice, day: event.target.value })}
          >
            {days.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
          </select>
          <select
            className="input-field"
            aria-label="Time"
            value={choice.minutes}
            onChange={(event) => onChange({ ...choice, minutes: Number(event.target.value) })}
          >
            {PICK_TIMES.map((time) => <option key={time.value} value={time.value}>{time.label}</option>)}
          </select>
        </div>
      )}
      {/* The line keeps its height so the cuisines do not jump as it answers. */}
      {choice.mode !== OPEN_MODES.any && (
        <p className="mt-2 min-h-5 text-sm text-slate-400" role="status">{description}</p>
      )}
    </div>
  );
}

// Narrowing a restaurant bowl's draw. Each cuisine the bowl holds is a chip
// that is in the draw or left out; "Only" leaves out every other one in one
// tap, because "we want pizza" is the usual way this question is asked. The
// bowl page owns focus, Escape and the scroll lock, as it does for the movie
// filters, through dialogRef.
export default function RestaurantFilterSheet({
  choices,
  excluded,
  onChange,
  summary,
  onClose,
  dialogRef = null,
  open = null,
}) {
  const isOpenEngaged = Boolean(open) && open.choice.mode !== OPEN_MODES.any;
  const reset = () => {
    onChange([]);
    if (isOpenEngaged) open.onChange({ mode: OPEN_MODES.any });
  };
  const excludedSet = new Set(excluded);
  const includedCount = choices.filter((choice) => !excludedSet.has(choice)).length;
  const description = includedCount === choices.length
    ? "All"
    : includedCount === 0
      ? "None"
      : excluded.length <= includedCount
        ? `All but ${choices.filter((choice) => excludedSet.has(choice)).join(", ")}`
        : choices.filter((choice) => !excludedSet.has(choice)).join(", ");

  const toggle = (choice) => onChange(
    excludedSet.has(choice) ? excluded.filter((value) => value !== choice) : [...excluded, choice]
  );
  const only = (choice) => onChange(choices.filter((value) => value !== choice));

  return (
    <div className="modal-overlay-top z-[70]" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-surface flex max-h-[calc(100dvh-5.5rem)] w-full max-w-xl flex-col overflow-clip rounded-t-none sm:max-w-md sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurant-filters-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-3.5 sm:px-5">
          <div>
            <h3 id="restaurant-filters-title" className="text-lg font-semibold text-slate-100">Narrow the draw</h3>
            <p className="mt-0.5 text-sm text-slate-400" role="status">{summary}</p>
          </div>
          {(excluded.length > 0 || isOpenEngaged) && (
            <button type="button" className="text-sm font-medium text-rose-300 hover:text-rose-200" onClick={reset}>
              Reset
            </button>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {open && <OpenSection open={open} />}
          {choices.length > 1 && (
            <>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-100" id="restaurant-cuisine-filter">Cuisine</p>
              <p className="text-sm text-slate-400">{description}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn btn-ghost px-3 text-sm" onClick={() => onChange([])}>All</button>
              <button type="button" className="btn btn-ghost px-3 text-sm" onClick={() => onChange([...choices])}>Clear</button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="restaurant-cuisine-filter">
            {choices.map((choice) => {
              const included = !excludedSet.has(choice);
              return (
                <span
                  key={choice}
                  className={`inline-flex overflow-hidden rounded-full border text-sm font-medium ${
                    included ? "border-rose-600 bg-rose-950/60 text-slate-100" : "border-slate-700 text-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={included}
                    className="px-3.5 py-2"
                    onClick={() => toggle(choice)}
                  >
                    {choice}
                  </button>
                  {included && choices.length > 1 && (
                    <button
                      type="button"
                      className="border-l border-rose-700 px-3 py-2 text-xs text-rose-200"
                      aria-label={`Only ${choice}`}
                      onClick={() => only(choice)}
                    >
                      Only
                    </button>
                  )}
                </span>
              );
            })}
          </div>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-slate-800 px-4 py-3 sm:px-5">
          {choices.length > 1 && <p className="mb-2 text-sm text-slate-400">Cuisines save automatically</p>}
          <button type="button" className="btn btn-primary w-full" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

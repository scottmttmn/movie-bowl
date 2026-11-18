// Mockup: the bowl's people as a row of initials between the stat line and
// the draw button. Tap someone who isn't on the couch tonight and their
// slips sit this draw out; tap again to bring them back.
export default function WhoIsHereRow({ rows = [], awayKeys = [], onToggle }) {
  const people = rows.filter((row) => row.key.startsWith("user:"));
  return (
    <div className="mx-auto mt-3 flex max-w-sm flex-wrap items-center justify-center gap-2.5">
      {people.map((row) => {
        const isAway = awayKeys.includes(row.key);
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => onToggle(row.key)}
            aria-pressed={!isAway}
            aria-label={`${row.name}${row.isYou ? " (you)" : ""}, ${isAway ? "not here" : "here"}`}
            title={row.name}
            className="group flex flex-col items-center gap-1 rounded-xl px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
          >
            <span
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold uppercase transition ${
                isAway
                  ? "border-dashed border-slate-700 bg-transparent text-slate-600"
                  : "border-rose-500 bg-rose-950/60 text-rose-100"
              }`}
            >
              {row.initial}
            </span>
            <span className={`max-w-[4.5rem] truncate text-xs ${isAway ? "text-slate-600 line-through" : "text-slate-300"}`}>
              {row.isYou ? "You" : row.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function FilterChipSelect({
  options,
  selectedValues,
  onToggle,
  onOnly,
  onSelectAll,
  onClear,
  unknownEnabled = false,
  onToggleUnknown,
  optionAriaLabelPrefix = "",
  unknownLabel = "Unknown",
  ariaLabel,
  className = "",
}) {
  const selectedSet = new Set(selectedValues || []);

  return (
    <div className={`space-y-2 ${className}`.trim()} role={ariaLabel ? "region" : undefined} aria-label={ariaLabel}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={onSelectAll}
        >
          All
        </button>
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={onClear}
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selectedSet.has(option);
          const chipClass = isSelected
            ? "border-rose-700 bg-rose-950/50 text-rose-200 shadow-sm shadow-rose-950/30"
            : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800";
          const ariaLabel = optionAriaLabelPrefix
            ? `${optionAriaLabelPrefix} ${option}`
            : option;

          return (
            <div
              key={option}
              className={`inline-flex min-h-10 items-center rounded-full border text-sm transition ${chipClass}`}
            >
              <button
                type="button"
                aria-label={ariaLabel}
                className="self-stretch px-3 py-2"
                onClick={() => onToggle?.(option)}
              >
                {option}
              </button>
              {isSelected && (
                <button
                  type="button"
                  aria-label={`Only ${option}`}
                  className="self-stretch border-l border-rose-700/70 px-2.5 py-2 text-[11px] font-medium text-rose-300 hover:text-rose-200"
                  onClick={() => onOnly?.(option)}
                >
                  Only
                </button>
              )}
            </div>
          );
        })}

        {onToggleUnknown && (
          <button
            type="button"
            aria-label={unknownLabel}
            className={`inline-flex min-h-10 items-center rounded-full border px-3 py-2 text-sm transition ${
              unknownEnabled
                ? "border-amber-700 bg-amber-950/45 text-amber-300"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
            }`}
            onClick={() => onToggleUnknown(!unknownEnabled)}
          >
            {unknownLabel}
          </button>
        )}
      </div>
    </div>
  );
}

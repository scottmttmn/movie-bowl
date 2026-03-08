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
            ? "border-blue-300 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
          const ariaLabel = optionAriaLabelPrefix
            ? `${optionAriaLabelPrefix} ${option}`
            : option;

          return (
            <div
              key={option}
              className={`inline-flex items-center rounded-full border text-sm ${chipClass}`}
            >
              <button
                type="button"
                aria-label={ariaLabel}
                className="px-3 py-1.5"
                onClick={() => onToggle?.(option)}
              >
                {option}
              </button>
              {isSelected && (
                <button
                  type="button"
                  aria-label={`Only ${option}`}
                  className="border-l border-blue-200/80 px-2 py-1.5 text-[11px] font-medium text-blue-700 hover:text-blue-800"
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
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm ${
              unknownEnabled
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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

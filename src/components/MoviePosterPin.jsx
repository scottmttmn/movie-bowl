export default function MoviePosterPin({
  isPinned,
  label,
  onClick,
  disabled = false,
  isSaving = false,
  describedBy,
}) {
  const className = `absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-slate-950/90 text-sm shadow-lg shadow-black/40 ${
    isPinned ? "border-rose-600 text-rose-300" : "border-slate-600 text-slate-200"
  }`;
  const icon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 ${isSaving ? "animate-pulse" : ""}`}
      fill={isPinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M5 3h14l-3 6v5l2 2H6l2-2V9L5 3Z" />
    </svg>
  );

  if (!onClick) {
    return isPinned ? <span role="img" aria-label="Pinned" title="Pinned" className={className}>{icon}</span> : null;
  }

  return (
    <button
      type="button"
      className={`icon-btn ${className}`}
      aria-label={label}
      aria-pressed={Boolean(isPinned)}
      aria-describedby={describedBy}
      aria-busy={isSaving || undefined}
      title={label}
      disabled={disabled || isSaving}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

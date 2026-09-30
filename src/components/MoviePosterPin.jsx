export default function MoviePosterPin({
  isPinned,
  label,
  onClick,
  disabled = false,
  isSaving = false,
  describedBy,
}) {
  const className = `poster-ribbon ${isPinned ? "is-picked" : ""}`;
  const icon = (
    <span aria-hidden="true" className={`poster-ribbon-shape ${isSaving ? "animate-pulse" : ""}`}>
      <svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>
    </span>
  );

  if (!onClick) {
    return isPinned ? <span role="img" aria-label="Favorite" title="Favorite" className={className}>{icon}</span> : null;
  }

  return (
    <button
      type="button"
      className={className}
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

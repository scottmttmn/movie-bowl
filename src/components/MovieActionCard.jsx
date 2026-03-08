export default function MovieActionCard({
  movie,
  dateLabelPrefix,
  dateValue,
  variant = "default",
  primaryActionLabel = "Details",
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
  disableWhileSyncing = true,
}) {
  const dateLabel = dateValue ? new Date(dateValue).toLocaleDateString() : null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || movie.tmdb_id == null || Number(movie.tmdb_id) <= 0
  );
  const posterUrl = movie.poster_path
    ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
    : movie.poster || null;
  const isSyncing = movie.local_status === "syncing";
  const disableActions = disableWhileSyncing && isSyncing;

  const cardToneClass =
    variant === "queued" ? "border-red-900/80 bg-red-950/30" : "border-slate-700 bg-slate-900";

  return (
    <article
      className={`w-32 flex-shrink-0 rounded-xl border p-2 ${
        cardToneClass
      } ${
        isSyncing ? "opacity-80" : ""
      }`}
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={movie.title}
          className="h-40 w-full rounded-md object-cover"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center rounded-md bg-slate-800 p-2">
          <p className="text-center text-xs font-semibold text-slate-200">{movie.title}</p>
        </div>
      )}
      <p className="mt-2 min-h-[2.5rem] line-clamp-2 text-xs font-semibold text-slate-100">
        {movie.title}
      </p>
      {isCustomEntry && (
        <span className="mb-1 inline-flex rounded-full border border-amber-700/70 bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
          Custom
        </span>
      )}
      {dateLabel && dateLabelPrefix && (
        <p className="mb-2 text-[11px] text-slate-500">
          {dateLabelPrefix}: {dateLabel}
        </p>
      )}
      {isSyncing && <p className="mb-2 text-[11px] font-medium text-red-300">Syncing...</p>}
      <div className="mt-auto grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onPrimaryAction?.(movie)}
          className="btn btn-secondary w-full px-2 py-1 text-xs"
          disabled={disableActions}
        >
          {primaryActionLabel}
        </button>
        {secondaryActionLabel && (
          <button
            type="button"
            onClick={() => onSecondaryAction?.(movie)}
            className="btn btn-danger w-full px-2 py-1 text-xs"
            disabled={disableActions}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </article>
  );
}

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
    variant === "queued" ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white";

  return (
    <article
      className={`w-32 flex-shrink-0 rounded-lg border p-2 ${
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
        <div className="h-40 w-full rounded-md bg-slate-200 p-2 flex items-center justify-center">
          <p className="text-xs text-center font-semibold text-slate-700">{movie.title}</p>
        </div>
      )}
      <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs font-semibold text-slate-800">
        {movie.title}
      </p>
      {isCustomEntry && (
        <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          Custom
        </span>
      )}
      {dateLabel && dateLabelPrefix && (
        <p className="mb-2 text-[11px] text-slate-500">
          {dateLabelPrefix}: {dateLabel}
        </p>
      )}
      {isSyncing && (
        <p className="mb-2 text-[11px] font-medium text-blue-700">Syncing...</p>
      )}
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
            className="btn w-full border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
            disabled={disableActions}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </article>
  );
}

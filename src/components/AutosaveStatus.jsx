const STATUS_LABELS = {
  idle: "Changes save automatically",
  pending: "Saving…",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Couldn't save changes",
};

const STATUS_TONES = {
  idle: "text-slate-400",
  pending: "text-slate-300",
  saving: "text-slate-300",
  saved: "text-emerald-300",
  error: "text-rose-300",
};

function StatusIcon({ status }) {
  if (status === "pending" || status === "saving") {
    return (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-slate-200"
      />
    );
  }
  if (status === "saved") return <span aria-hidden="true">✓</span>;
  if (status === "error") return <span aria-hidden="true">⚠</span>;
  return null;
}

export default function AutosaveStatus({ status }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-sm ${STATUS_TONES[status] || STATUS_TONES.idle}`}
    >
      <StatusIcon status={status} />
      {STATUS_LABELS[status] || STATUS_LABELS.idle}
    </span>
  );
}

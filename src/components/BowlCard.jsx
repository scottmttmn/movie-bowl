export default function BowlCard({ bowl, onSelect }) {
  return (
    <button
      type="button"
      className="panel bowl-card w-full cursor-pointer text-left transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => onSelect(bowl.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                bowl.role === "Owner"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {bowl.role}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold text-slate-800">{bowl.name}</h3>
        </div>
        <span className="text-sm font-medium text-slate-500">Open</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Remaining</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{bowl.remainingCount}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Members</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{bowl.memberCount}</p>
        </div>
      </div>
    </button>
  );
}

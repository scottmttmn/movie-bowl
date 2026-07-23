export default function BowlCard({ bowl, onSelect }) {
  return (
    <button
      type="button"
      className="panel bowl-card group w-full cursor-pointer text-left transition duration-200 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
      onClick={() => onSelect(bowl.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                bowl.role === "Owner"
                  ? "border border-rose-900/70 bg-rose-950/55 text-rose-200"
                  : "border border-slate-700 bg-slate-800 text-slate-300"
              }`}
            >
              {bowl.role}
            </span>
          </div>
          <h3 className="mt-3 truncate text-lg font-semibold text-slate-100">{bowl.name}</h3>
        </div>
        <span className="text-sm font-medium text-slate-400 transition group-hover:text-rose-300">
          Open <span aria-hidden="true">→</span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Remaining</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{bowl.remainingCount}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Members</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">{bowl.memberCount}</p>
        </div>
      </div>
    </button>
  );
}

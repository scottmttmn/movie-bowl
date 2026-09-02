export default function BowlCard({ bowl, onSelect, isDefault = false, onMakeDefault, defaultDisabled = false }) {
  return (
    <div className="panel bowl-card group relative">
    <button
      type="button"
      className="w-full cursor-pointer text-left transition duration-200 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
      onClick={() => onSelect(bowl.id)}
    >
      <div className="min-w-0 pr-14">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
            bowl.role === "Owner"
              ? "border border-rose-900/70 bg-rose-950/55 text-rose-200"
              : "border border-slate-700 bg-slate-800 text-slate-300"
          }`}
        >
          {bowl.role}
        </span>
        <h3 className="mt-3 truncate text-lg font-semibold text-slate-100">{bowl.name}</h3>
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
    {onMakeDefault && <button
      type="button"
      className={`icon-btn absolute right-3 top-3 h-11 w-11 ${isDefault ? "text-rose-400" : "text-slate-400"}`}
      aria-label={isDefault ? `Home bowl: ${bowl.name}` : `Make ${bowl.name} my home bowl`}
      aria-pressed={isDefault}
      disabled={defaultDisabled}
      onClick={onMakeDefault}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill={isDefault ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
      </svg>
    </button>}
    </div>
  );
}

// The home bowl is marked here, never set here. A star with aria-pressed would
// describe a toggle that can be switched off; a home bowl can only be moved, and
// the one command that moves it lives in the dashboard picker.
export default function BowlCard({ bowl, onSelect, isHome = false }) {
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
    {isHome && (
      <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-rose-950/70 px-2.5 py-1 text-xs font-semibold text-rose-300">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M12 3.2 2.8 11.1a1 1 0 0 0 .66 1.75H5v7.3a.9.9 0 0 0 .9.9h4.05v-5.2h4.1v5.2h4.05a.9.9 0 0 0 .9-.9v-7.3h1.54a1 1 0 0 0 .66-1.75Z" />
        </svg>
        Home
      </span>
    )}
    </div>
  );
}

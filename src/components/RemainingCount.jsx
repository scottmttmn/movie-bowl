export default function RemainingCount({ count }) {
    return (
      <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/55 px-3.5 py-1.5 text-sm font-medium text-slate-400">
        Remaining: <span className="text-base font-bold text-slate-100">{count}</span>
      </p>
    );
  }

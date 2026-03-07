export default function RemainingCount({ count }) {
    return (
      <p className="mt-2 text-sm font-medium text-slate-500">
        Remaining: <span className="font-bold">{count}</span>
      </p>
    );
  }

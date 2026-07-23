function formatOdds(value) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

export default function DrawOddsStats({ stats }) {
  return (
    <section className="panel mt-6 overflow-hidden">
      <h3 className="section-title mb-4">Draw Odds</h3>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="pb-3 font-semibold">Contributor</th>
            <th className="pb-3 font-semibold">Remaining</th>
            <th className="pb-3 font-semibold">Draw Odds</th>
          </tr>
        </thead>
        <tbody>
          {stats.length === 0 ? (
            <tr className="border-t border-slate-800">
              <td className="py-3 text-slate-400" colSpan={3}>
                Add movies to see draw odds.
              </td>
            </tr>
          ) : (
            stats.map((s) => (
              <tr key={s.bucketKey} className="border-t border-slate-800 transition hover:bg-slate-800/30">
                <td className="py-3 text-slate-200">{s.member}</td>
                <td className="py-3 font-medium text-slate-300">{s.movieCount}</td>
                <td className="py-3 font-semibold text-rose-300">{formatOdds(s.drawOdds)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </section>
  );
}

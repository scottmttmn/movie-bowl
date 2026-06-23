function formatOdds(value) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value * 100)}%`;
}

export default function DrawOddsStats({ stats }) {
  return (
    <section className="panel mt-6">
      <h3 className="section-title mb-3">Draw Odds</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-2 font-semibold">Contributor</th>
            <th className="pb-2 font-semibold">Remaining</th>
            <th className="pb-2 font-semibold">Draw Odds</th>
          </tr>
        </thead>
        <tbody>
          {stats.length === 0 ? (
            <tr className="border-t border-slate-100">
              <td className="py-2 text-slate-500" colSpan={3}>
                Add movies to see draw odds.
              </td>
            </tr>
          ) : (
            stats.map((s) => (
              <tr key={s.bucketKey} className="border-t border-slate-100">
                <td className="py-2">{s.member}</td>
                <td className="py-2 font-medium">{s.movieCount}</td>
                <td className="py-2 font-medium">{formatOdds(s.drawOdds)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}

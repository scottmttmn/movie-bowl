export default function ContributionStats({ stats }) {
    return (
      <section className="panel mt-6">
        <h3 className="section-title mb-3">Contribution Stats</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pb-2 font-semibold">Member</th>
              <th className="pb-2 font-semibold">Total Added</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.member} className="border-t border-slate-100">
                <td className="py-2">{s.member}</td>
                <td className="py-2 font-medium">{s.totalAdded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

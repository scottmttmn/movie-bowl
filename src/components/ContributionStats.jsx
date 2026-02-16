export default function ContributionStats({ stats }) {
    return (
      <div className="contribution-stats border p-3 rounded mt-4">
        <h3 className="font-semibold mb-2">Contribution Stats</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th>Member</th>
              <th>Total Added</th>
              <th>Last 7 Days</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.member}>
                <td>{s.member}</td>
                <td>{s.totalAdded}</td>
                <td>{s.last7Days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
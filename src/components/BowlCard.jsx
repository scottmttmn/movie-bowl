export default function BowlCard({ bowl, onSelect }) {
    return (
      <div
        className="panel bowl-card cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
        onClick={() => onSelect(bowl.id)}
      >
        <h3 className="text-lg font-semibold text-slate-800">{bowl.name}</h3>
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>Remaining: {bowl.remainingCount}</p>
          <p>Members: {bowl.memberCount}</p>
          <p>Role: {bowl.role}</p>
        </div>
      </div>
    );
  }

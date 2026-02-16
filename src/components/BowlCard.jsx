export default function BowlCard({ bowl, onSelect }) {
    return (
      <div
        className="bowl-card border p-4 rounded cursor-pointer"
        onClick={() => onSelect(bowl.id)}
      >
        <h3>{bowl.name}</h3>
        <p>Remaining: {bowl.remainingCount}</p>
        <p>Members: {bowl.memberCount}</p>
        <p>Role: {bowl.role}</p>
      </div>
    );
  }
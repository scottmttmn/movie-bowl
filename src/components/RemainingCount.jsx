export default function RemainingCount({ count }) {
    return (
      <p className="mt-2 text-gray-700 font-medium">
        Remaining: <span className="font-bold">{count}</span>
      </p>
    );
  }
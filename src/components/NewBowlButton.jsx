export default function NewBowlButton({ onClick, disabled = false }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        + New Bowl
      </button>
    );
  }

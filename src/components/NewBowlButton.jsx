export default function NewBowlButton({ onClick }) {
    return (
      <button
        onClick={onClick}
        className="btn btn-primary"
      >
        + New Bowl
      </button>
    );
  }

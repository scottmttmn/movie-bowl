export default function AddMovieButton({ onClick, disabled = false }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        + Add Movie
      </button>
    );
  }

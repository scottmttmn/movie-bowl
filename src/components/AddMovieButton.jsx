export default function AddMovieButton({ onClick }) {
    return (
      <button
        onClick={onClick}
        className="btn btn-primary"
      >
        + Add Movie
      </button>
    );
  }

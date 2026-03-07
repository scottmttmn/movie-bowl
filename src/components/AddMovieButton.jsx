export default function AddMovieButton({ onClick, disabled = false, variant = "secondary" }) {
    const buttonClass = variant === "primary" ? "btn btn-primary" : "btn btn-secondary";

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`${buttonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        + Add Movie
      </button>
    );
  }

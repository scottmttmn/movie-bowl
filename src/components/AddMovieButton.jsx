export default function AddMovieButton({ onClick, disabled = false, variant = "secondary" }) {
    const buttonClass = variant === "primary" ? "btn btn-primary" : "btn btn-secondary";

    // The header's + is already named "Add a movie", so this one says which
    // bowl to screen readers while showing the same words and mark.
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label="Add a movie to this bowl"
        className={`${buttonClass} min-w-40 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add a movie
      </button>
    );
  }

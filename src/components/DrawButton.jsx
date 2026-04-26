export default function DrawButton({ onClick, disabled, isLoading = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="btn btn-danger min-w-40 disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={isLoading ? "Drawing movie from bowl" : "Draw movie from bowl"}
    >
      {isLoading ? "Drawing..." : "Draw from Bowl"}
    </button>
  );
}

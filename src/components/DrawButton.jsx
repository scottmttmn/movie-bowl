export default function DrawButton({ onClick, disabled, isLoading = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className="btn btn-primary min-w-40 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? "Drawing..." : "Draw Movie"}
    </button>
  );
}

export default function DrawButton({ onClick, disabled, isLoading = false }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`btn px-8 py-3 text-lg ${
          disabled || isLoading
            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
            : "bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-200"
        }`}
      >
        {isLoading ? "Drawing..." : "🎲 Draw Movie"}
      </button>
    );
  }

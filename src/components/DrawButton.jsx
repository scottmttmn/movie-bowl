export default function DrawButton({ onClick, disabled }) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`px-6 py-3 text-white font-bold rounded ${
          disabled ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
        }`}
      >
        🎲 Draw Movie
      </button>
    );
  }
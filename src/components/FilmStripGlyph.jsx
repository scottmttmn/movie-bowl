// A bowl's titles, counted: the film strip that stands beside the number on
// My Bowls and in the bowl picker.
export default function FilmStripGlyph({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4m-4 6h4M17 9h4m-4 6h4" />
    </svg>
  );
}

// The home bowl's mark wherever a bowl is named: a house, never a star or a
// toggle, because a home bowl can only be moved, not switched off.
export default function HomeGlyph({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 3.2 2.8 11.1a1 1 0 0 0 .66 1.75H5v7.3a.9.9 0 0 0 .9.9h4.05v-5.2h4.1v5.2h4.05a.9.9 0 0 0 .9-.9v-7.3h1.54a1 1 0 0 0 .66-1.75Z" />
    </svg>
  );
}

// Points down while a section is closed and up while it is open.
export default function SectionChevron({ open }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`section-toggle-chevron transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

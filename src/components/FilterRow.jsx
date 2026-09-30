// One filter: its name, what it is set to, and a chevron that turns when it
// opens. The whole row is the control, so there is no separate "Edit" link to
// find, and the value reads as a setting rather than a sentence.
export default function FilterRow({ label, value, isOpen, onToggle, controls }) {
  return (
    <button type="button" className="filter-row-button" aria-expanded={isOpen} aria-controls={controls} onClick={onToggle}>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-slate-100">{label}</span>
        <span className="mt-0.5 block truncate text-sm text-slate-400">{value}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="filter-row-chevron" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

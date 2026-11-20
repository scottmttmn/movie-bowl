import { useEffect, useRef } from "react";

export function SearchGlyph({ className = "h-5 w-5" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

// The field that replaces the magnifier once tapped. Escape or the cross
// closes it and puts the whole list back.
export function ListSearchField({ value, onChange, onClose, label, className = "" }) {
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={`list-search ${className}`}>
      <SearchGlyph className="list-search-glyph" />
      <input
        ref={inputRef}
        type="search"
        className="list-search-input"
        aria-label={label}
        value={value}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
      <button type="button" className="list-search-close" aria-label="Close search" onClick={onClose}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

// A bare magnifier beside the section's chevron: no box, no border, the same
// muted weight as the chevron, so a long list gains it without gaining a control.
export function HeaderSearchButton({ label, onClick }) {
  return (
    <button type="button" className="section-search-btn" aria-label={label} title={label} onClick={onClick}>
      <SearchGlyph className="h-4 w-4" />
    </button>
  );
}

// Nothing matched: the strip keeps its height and shows a crossed magnifier.
export function StripNoMatch() {
  return (
    <div className="strip-no-match" role="img" aria-label="No matches">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5M8 8l6 6" />
      </svg>
    </div>
  );
}

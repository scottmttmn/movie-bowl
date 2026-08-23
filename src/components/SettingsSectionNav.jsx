// Header nav for the settings screens: each tile reads back one section's
// current state and jumps to it, so the page is legible before anything is
// opened and needs no separate table of contents.

// Spelled out rather than interpolated — Tailwind only generates classes it can
// find as literal text in the source.
const COLUMN_CLASSES = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export default function SettingsSectionNav({
  items,
  ariaLabel = "Settings sections",
  className = "",
}) {
  if (!items || items.length === 0) return null;

  const columns = COLUMN_CLASSES[items.length] || COLUMN_CLASSES[3];

  return (
    <nav aria-label={ariaLabel} className={`grid gap-2 ${columns} ${className}`.trim()}>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="surface-card block px-3.5 py-3 transition hover:border-slate-600 hover:bg-slate-900/60"
        >
          <span className="eyebrow block text-[0.65rem]">{item.label}</span>
          <span className="mt-1.5 block text-sm text-slate-200">{item.value}</span>
        </a>
      ))}
    </nav>
  );
}

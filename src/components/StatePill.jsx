// Shared shape for the chips under the bowl illustration. Each one is a readout
// of what the draw is about to do, so they share a tone vocabulary:
// idle = nothing is being narrowed, active = a preference is narrowing the draw,
// warning = the narrowing is engaged but the result should give you pause.
const BASE_CLASSES =
  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition";

const TONE_CLASSES = {
  idle: "border-slate-700/80 bg-slate-950/55 text-slate-400",
  active: "border-rose-700 bg-rose-950/30 text-rose-300",
  warning: "border-amber-700 bg-amber-950/30 text-amber-300",
};

// Hover stays inside the tone's own hue: the chip's border is a state readout,
// so a pointer passing over it must not look like that state changed.
const HOVER_CLASSES = {
  idle: "hover:border-slate-600 hover:text-slate-300",
  active: "hover:border-rose-600 hover:text-rose-200",
  warning: "hover:border-amber-600 hover:text-amber-200",
};

const DOT_CLASSES = {
  idle: "border border-slate-500",
  active: "bg-rose-400",
  warning: "bg-amber-400",
};

const COUNT_CLASSES = {
  idle: "font-semibold text-slate-200",
  active: "font-semibold text-rose-200",
  warning: "font-semibold text-amber-200",
};

// The number a chip is really about, emphasized within the chip's own tone.
export function PillCount({ tone = "idle", children }) {
  return <span className={COUNT_CLASSES[tone]}>{children}</span>;
}

// `as` is explicit rather than inferred from `onClick`: a chip that opens a
// panel stays a button even in the states where its handler has not been wired
// up, so the control does not appear and disappear from the tab order.
export default function StatePill({ as = "p", tone = "idle", onClick, ariaLabel, children }) {
  const dot = (
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} />
  );

  if (as === "button") {
    return (
      <button
        type="button"
        data-tone={tone}
        onClick={onClick}
        aria-label={ariaLabel}
        className={`${BASE_CLASSES} ${TONE_CLASSES[tone]} ${HOVER_CLASSES[tone]}`}
      >
        {dot}
        {children}
      </button>
    );
  }

  return (
    <p data-tone={tone} className={`${BASE_CLASSES} ${TONE_CLASSES[tone]}`}>
      {dot}
      {children}
    </p>
  );
}

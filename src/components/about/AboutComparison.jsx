const MODES = [
  {
    id: "browse",
    railLabel: "You choose everything",
    title: "Browse everything",
    body: "Every movie is still possible. Apparently, so is another half hour of browsing.",
  },
  {
    id: "bowl",
    railLabel: "You choose the pool",
    title: "Draw from the bowl",
    body: "You decide what is eligible. A draw you can explain decides the rest.",
  },
  {
    id: "recommend",
    railLabel: "A system chooses",
    title: "Take a recommendation",
    body: "A confident answer in a second, as long as you are comfortable letting a system set the shortlist.",
  },
];

export default function AboutComparison() {
  return (
    <section aria-labelledby="comparison-heading">
      <h2
        id="comparison-heading"
        className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500"
      >
        Where this sits
      </h2>

      <div className="about-spectrum-rail mt-6" aria-hidden="true">
        {MODES.map((mode) => (
          <div key={mode.id} className="about-spectrum-stop">
            <span>{mode.railLabel}</span>
            <i />
          </div>
        ))}
      </div>

      <dl className="mt-6 grid gap-x-4 gap-y-6 sm:grid-cols-3">
        {MODES.map((mode) => (
          <div key={mode.id}>
            <p
              aria-hidden="true"
              className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-slate-500 sm:hidden"
            >
              {mode.railLabel}
            </p>
            <dt
              className={`text-base font-semibold tracking-tight sm:mt-0 ${
                mode.id === "bowl" ? "mt-1.5 text-rose-200" : "mt-1.5 text-slate-300"
              }`}
            >
              {mode.title}
            </dt>
            <dd className="mt-1.5 text-sm leading-6 text-slate-400">{mode.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function DrawMethodDisclosure() {
  return (
    <details className="group mx-auto mt-3 max-w-xl text-left">
      <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-slate-500">
          ⓘ
        </span>
        How this bowl picks
        <span
          aria-hidden="true"
          className="text-[10px] text-slate-500 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <p className="mx-auto mt-2 max-w-lg rounded-xl border border-slate-800 bg-slate-950/45 px-3.5 py-3 text-sm leading-6 text-slate-300">
        Right now, the bowl picks a person first, then one of their movies. Each person is equally
        likely to be picked, regardless of how many movies they added.
      </p>
    </details>
  );
}

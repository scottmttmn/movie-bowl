import { SUPPORT_EMAIL } from "../lib/appConfig";

export default function AboutPage() {
  return (
    <div className="page-container py-6 sm:py-8">
      <section className="page-hero mx-auto max-w-3xl">
        <p className="eyebrow">The simple way to pick movie night</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">About Movie Bowl</h1>
        <p className="mt-4 text-base leading-7 text-slate-300">
          Movie Bowl helps groups decide what to watch by drawing from a shared bowl of titles.
        </p>

        <div className="mt-8 border-t border-slate-800 pt-6">
          <h2 className="text-xl font-semibold text-slate-100">How it works</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
            <li>Create or join a bowl.</li>
            <li>Add movies or custom entries.</li>
            <li>Draw with optional filters and preferences.</li>
          </ul>
        </div>

        <div className="mt-8 border-t border-slate-800 pt-6">
          <h2 className="text-xl font-semibold text-slate-100">Collaboration basics</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-300">
            <li>Members can contribute titles to the bowl.</li>
            <li>Owners can manage invites and bowl settings.</li>
            <li>Draw access can be owner-managed per bowl.</li>
          </ul>
        </div>

        <div className="mt-6">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="btn btn-secondary"
          >
            Contact support
          </a>
        </div>

        <p className="mt-6 text-xs text-slate-400">TMDB data used for movie metadata and availability.</p>
      </section>
    </div>
  );
}

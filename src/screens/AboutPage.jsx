import { SUPPORT_EMAIL } from "../lib/appConfig";

export default function AboutPage() {
  return (
    <div className="page-container py-6">
      <section className="panel max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-slate-800">About Movie Bowl</h1>
        <p className="mt-3 text-slate-700">
          Movie Bowl helps groups decide what to watch by drawing from a shared bowl of titles.
        </p>

        <div className="mt-6">
          <h2 className="text-xl font-semibold text-slate-800">How it works</h2>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
            <li>Create or join a bowl.</li>
            <li>Add movies or custom entries.</li>
            <li>Draw with optional filters and preferences.</li>
          </ul>
        </div>

        <div className="mt-6">
          <h2 className="text-xl font-semibold text-slate-800">Collaboration basics</h2>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
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

        <p className="mt-6 text-xs text-slate-500">TMDB data used for movie metadata and availability.</p>
      </section>
    </div>
  );
}

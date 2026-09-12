import { Link } from "react-router-dom";
import AboutComparison from "../components/about/AboutComparison";
import AboutDrawDemo from "../components/about/AboutDrawDemo";
import useAuth from "../hooks/useAuth";
import { SUPPORT_EMAIL } from "../lib/appConfig";

const MOMENTS = [
  {
    when: "Over the month",
    step: "Collect over time",
    body: "Bowl members add movies whenever someone says, “We should watch that.”",
  },
  {
    when: "Tonight",
    step: "Filter for tonight",
    body: "Narrow the bowl to what fits: under two hours, on your services, maybe something funny.",
  },
  {
    when: "One draw later",
    step: "Draw together",
    body: "The bowl selects a member first, then one of their movies. The search is over.",
  },
];

export default function AboutPage() {
  const { session } = useAuth();
  const productAction = session
    ? { label: "Open my bowls", to: "/" }
    : { label: "Start a bowl", to: "/login" };

  return (
    <main className="page-container pb-12 pt-6 sm:pb-16 sm:pt-8">
      <section className="about-hero overflow-hidden rounded-[2rem] border border-slate-700/70 px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-14">
        <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_0.82fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <p className="eyebrow text-rose-300">A better way to choose movie night</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              Stop searching. Start watching.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8 lg:mx-0">
              Movie Bowl is the space between endless scrolling and handing the choice to an
              algorithm. You and the people you watch with fill the bowl with movies someone wants
              to see. A fair draw picks tonight&apos;s.
            </p>
            <p className="mx-auto mt-4 max-w-lg text-sm font-medium leading-6 text-slate-400 lg:mx-0">
              Built for couples, families, and anyone tired of asking, “What do you want to watch?”
            </p>

            <div className="mt-8 flex justify-center lg:justify-start">
              <Link to={productAction.to} className="btn btn-primary w-full sm:w-auto">
                {productAction.label}
              </Link>
            </div>
          </div>

          <AboutDrawDemo />
        </div>
      </section>

      {/* The thesis gets a beat to itself. Stated as one line at display size it
          lands; split across a grid of principle cards it reads as filler. */}
      <section className="mx-auto mt-20 max-w-3xl text-center sm:mt-24">
        <p className="text-2xl font-medium leading-9 tracking-tight text-slate-100 sm:text-3xl sm:leading-[2.75rem]">
          When every option in the bowl is one somebody wants to watch,{" "}
          <span className="text-rose-300">chance is not a compromise.</span> It is a clean way to
          commit.
        </p>
      </section>

      <section
        aria-labelledby="tonight-heading"
        className="about-tonight mt-20 overflow-hidden rounded-[2rem] border border-slate-700/70 px-5 py-8 sm:mt-24 sm:px-8 sm:py-10 lg:px-10"
      >
        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="eyebrow text-rose-300">Tonight, 8:13 p.m.</p>
            <h2
              id="tonight-heading"
              className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
            >
              Everyone is ready to watch. Nobody wants to browse.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Movie Bowl does not need to guess what everyone might enjoy. Every title in the bowl
              was added by someone who wants to watch it, so the only question left is which one —
              and that is the question the bowl answers.
            </p>
          </div>

          <ol className="about-moment-list" aria-label="How a movie reaches movie night">
            {MOMENTS.map((moment) => (
              <li key={moment.step}>
                <span aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {moment.when}
                  </p>
                  <p className="mt-1 text-base font-semibold tracking-tight text-slate-100">
                    {moment.step}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{moment.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="mx-auto mt-20 max-w-4xl sm:mt-24">
        <AboutComparison />
      </div>

      <section className="mt-20 text-center sm:mt-24">
        <div className="page-hero mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-10">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            A little structure. One good surprise. No endless scroll.
          </h2>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to={productAction.to} className="btn btn-primary w-full sm:w-auto">
              {productAction.label}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-secondary w-full sm:w-auto">
              Contact support
            </a>
          </div>
        </div>
        <div className="mx-auto mt-7 max-w-xl text-xs leading-5 text-slate-500">
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="mx-auto block w-14 opacity-80 transition hover:opacity-100"
            aria-label="The Movie Database"
          >
            <img src="/tmdb-logo.svg" alt="" />
          </a>
          <p className="mt-3">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p>
            Streaming availability data provided by{" "}
            <a
              href="https://www.justwatch.com"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-700 underline-offset-2 hover:text-slate-300"
            >
              JustWatch
            </a>
            {" "}through TMDB.
          </p>
        </div>
      </section>
    </main>
  );
}

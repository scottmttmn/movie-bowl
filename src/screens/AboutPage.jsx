import { Link } from "react-router-dom";
import AboutDecisionSpectrum from "../components/about/AboutDecisionSpectrum";
import useAuth from "../hooks/useAuth";
import { SUPPORT_EMAIL } from "../lib/appConfig";

const PRINCIPLES = [
  {
    number: "01",
    title: "Curate deliberately",
    body: "Add the movies that catch your attention when you find them. Movie night should not begin with a blank search box.",
  },
  {
    number: "02",
    title: "Decide playfully",
    body: "When every remaining option is worth watching, chance is not a compromise. It is a clean way to commit.",
  },
  {
    number: "03",
    title: "Share the choice",
    body: "The bowl selects a member first, then one of their movies. A long personal list does not drown out another bowl member's picks.",
  },
];

const FLOW_STEPS = [
  {
    step: "Collect over time",
    body: "Add movies as you think of them.",
  },
  {
    step: "Filter for tonight",
    body: "Narrow by streaming availability, rating, genre, or runtime when the night calls for it.",
  },
  {
    step: "Draw together",
    body: "Make one transparent draw from a pool built by bowl members.",
  },
];

export default function AboutPage() {
  const { session } = useAuth();
  const productAction = session
    ? { label: "Open my bowls", to: "/" }
    : { label: "Start a bowl", to: "/login" };

  return (
    <main className="page-container pb-12 pt-6 sm:pb-16 sm:pt-8">
      <section className="about-hero overflow-hidden rounded-[2rem] border border-slate-700/70 px-5 py-12 text-center sm:px-8 sm:py-16 lg:py-20">
        <div className="relative z-10 mx-auto max-w-4xl">
          <p className="eyebrow text-rose-300">A better way to choose movie night</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            Stop searching. Start watching.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            Movie Bowl is the space between endless scrolling and handing the choice to an algorithm.
            You and the people you watch with fill the bowl with movies someone wants to see. A fair
            draw picks tonight&apos;s.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm font-medium leading-6 text-slate-400">
            Built for couples, families, and anyone tired of asking, “What do you want to watch?”
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#decision-demo" className="btn btn-primary w-full sm:w-auto">
              Try the demo
              <span aria-hidden="true">↓</span>
            </a>
            <Link to={productAction.to} className="btn btn-secondary w-full sm:w-auto">
              {productAction.label}
            </Link>
          </div>
        </div>
      </section>

      <div className="mt-16 sm:mt-20">
        <AboutDecisionSpectrum />
      </div>

      <section aria-labelledby="beliefs-heading" className="mt-20 sm:mt-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-rose-300">The philosophy</p>
          <h2
            id="beliefs-heading"
            className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
          >
            What Movie Bowl believes
          </h2>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <article key={principle.number} className="panel h-full">
              <span className="about-principle-number" aria-hidden="true">
                {principle.number}
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-100">{principle.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{principle.body}</p>
            </article>
          ))}
        </div>
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
              During the week, bowl members added movies whenever someone said, “We should watch
              that.” Tonight, you narrow the bowl to what fits: under two hours, available on your
              services, maybe something funny. One draw later, the search is over.
            </p>
            <p className="mt-5 border-l-2 border-rose-600 pl-4 text-sm font-medium leading-6 text-slate-200">
              Movie Bowl does not need to guess what everyone might enjoy. Every title in the bowl
              was added by someone who wants to watch it.
            </p>
          </div>

          <ol className="about-moment-list" aria-label="How a movie reaches movie night">
            <li>
              <span aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Over the month
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-200">
                  Bowl members add promising movies as they find them.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Tonight</p>
                <p className="mt-1 text-sm leading-6 text-slate-200">
                  Bowl members pick practical constraints for the evening.
                </p>
              </div>
            </li>
            <li>
              <span aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-300">One draw later</p>
                <p className="mt-1 text-sm leading-6 text-white">The movie starts.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="flow-heading" className="mt-20 sm:mt-24">
        <div className="text-center">
          <p className="eyebrow text-rose-300">How it works</p>
          <h2
            id="flow-heading"
            className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
          >
            From “we should watch that” to pressing play
          </h2>
        </div>

        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {FLOW_STEPS.map((item, index) => (
            <li key={item.step} className="panel-muted relative p-5 sm:p-6">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">
                Step {index + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-100">{item.step}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
              {index < FLOW_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-xl text-slate-600 md:block"
                >
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20 text-center sm:mt-24">
        <div className="page-hero mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-10">
          <p className="eyebrow text-rose-300">Ready when you are</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
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

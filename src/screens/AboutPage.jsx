import { Link } from "react-router-dom";
import AboutDrawDemo from "../components/about/AboutDrawDemo";
import useAuth from "../hooks/useAuth";
import { SUPPORT_EMAIL } from "../lib/appConfig";

// The page is one person's account, so the copy lives in constants the way the
// rest of this screen's copy always has, rather than being broken across JSX.
const STORY = [
  "Movie Bowl began because of a problem with my girlfriend.",
  "We watched movies instead of TV because she didn’t like TV. She found it addictive and didn’t want to spend a lot of time in front of screens. Fair enough. So we watched movies. I like movies.",
  "The difficulty was the deciding. We had HBO Max, so we would open the app and start browsing. Lots of options, but mostly things we hadn’t heard of, or that one of us had already seen. Someone would propose watching a trailer. That almost never helped. Frustration mounted, the clock kept ticking, and either we gave up or we picked something neither of us was satisfied with, just because we were annoyed with the selection process.",
  "One day, I had a bright idea. Write down the movies we want to see on little pieces of paper, and when we want to watch a movie, draw from the bowl.",
  "This was a revelation. I brought it up in conversation whenever possible, with friends and with family. We did this for at least a year.",
];

// Each of these is a thing that actually went wrong with the paper bowl, paired
// with the feature that answers it. Stated in that order the feature list is a
// history, which is the one thing a feature list cannot fake. Scott's emphasis
// on the last one is why it is last: the marked list ends on it.
const IMPERFECTIONS = [
  {
    id: "dominant",
    problem:
      "One person could dominate the bowl, and a less enthusiastic slip writer might seldom get their movies chosen.",
    answer:
      "So the draw picks a person first, then one of their movies. Adding more titles gives you more ways to be chosen, not a better chance of being the one chosen.",
  },
  {
    id: "rental",
    problem:
      "There might be slips in the bowl for movies on one of our streaming services, but they were just as likely to come up as the ones we would rent for $3.99 on Amazon.",
    answer: "So you can narrow the bowl to what you already pay for before you draw.",
  },
  {
    id: "record",
    problem:
      "I wanted a record of the movies we watched, and two bowls of slips was deemed too confusing.",
    answer: "So a drawn movie moves itself to a watched list. Still one bowl.",
  },
  {
    id: "water",
    problem:
      "One evening a friend’s two-year-old found the slips and put some of them into a glass of water.",
    answer: "Nothing here dissolves.",
  },
  {
    id: "location",
    problem:
      "Most importantly, the bowl was in one location. I would hear about an appealing movie out and about, and I would have to remember to write it down and then make sure that piece of paper made it into the bowl.",
    answer: "So the bowl is wherever you are. Add a movie the moment you hear about it.",
  },
];

const PAPER_DIRECTIONS = [
  "Find a bowl and keep it somewhere safe.",
  "Keep paper and a pen next to the bowl. Cut or tear off a little piece of paper.",
  "Write a movie you want to watch on the piece of paper. Optionally include the date.",
  "Put the slip of paper in the bowl, folded so that the title is hidden.",
  "When it is time to watch, draw one slip.",
  "Watch the movie.",
  "If you want a record of what you watched, keep the drawn slips in a separate container.",
];

const PAPER_LEAD =
  "It wasn’t an easy decision to make this app, because the bowl with slips of paper is charming. If you, dear reader, like that idea, I encourage you to go right ahead. Here is how we did it.";

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

      {/* The page used to open this band with an invented scene — "Tonight, 8:13
          p.m." — describing a frustration the author had actually lived. The
          real account is better than the staged one and costs the same room. */}
      <section
        aria-labelledby="story-heading"
        className="about-story mt-20 overflow-hidden rounded-[2rem] border border-slate-700/70 px-5 py-8 sm:mt-24 sm:px-8 sm:py-10 lg:px-10"
      >
        <div className="mx-auto max-w-2xl">
          <p className="eyebrow text-rose-300">How this started</p>
          <h2
            id="story-heading"
            className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
          >
            Why there is a bowl
          </h2>
          <div className="mt-6 space-y-4">
            {STORY.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="text-base leading-7 text-slate-300">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="imperfections-heading" className="mt-20 sm:mt-24">
        <div className="mx-auto max-w-2xl">
          <h2
            id="imperfections-heading"
            className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
          >
            Then I started noticing things
          </h2>

          <ol className="about-marked-list mt-6" aria-label="What went wrong with the paper bowl">
            {IMPERFECTIONS.map((item) => (
              <li key={item.id}>
                <span aria-hidden="true" />
                <div>
                  <p className="text-base leading-7 text-slate-200">{item.problem}</p>
                  <p className="mt-1.5 text-sm leading-6 text-rose-200/85">{item.answer}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-base leading-7 text-slate-400">
            There are quite a few other features that have come along, and I hope more yet to come
            in time.
          </p>
        </div>
      </section>

      {/* The invitation to skip the app entirely. It is the least salesy thing
          on the page and the reason the section carries no visible heading: the
          paragraph already says what this is, and a heading over it said it a
          second time. */}
      <section aria-labelledby="paper-heading" className="mt-20 sm:mt-24">
        <div className="mx-auto max-w-2xl">
          <h2 id="paper-heading" className="sr-only">
            How to run a bowl out of paper
          </h2>
          <p className="text-base leading-7 text-slate-300">{PAPER_LEAD}</p>

          {/* Deliberately light type on a light surface: this is the one object
              on the page that is not the product, so it does not use the app's
              dark tokens. */}
          <ol className="about-paper-card mt-8 space-y-3 px-7 py-7 pl-11 sm:px-9 sm:py-8 sm:pl-14">
            {PAPER_DIRECTIONS.map((step) => (
              <li
                key={step}
                className="text-[0.95rem] leading-7 text-slate-800 marker:font-bold marker:text-rose-800/70"
              >
                {step}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-16 text-center sm:mt-20">
        <div className="page-hero mx-auto max-w-3xl px-5 py-9 sm:px-8 sm:py-10">
          <p className="mx-auto max-w-lg text-base leading-7 text-slate-300">
            If it starts to fray the way ours did, this is here.
          </p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-white">Welcome.</p>
          <p className="mt-2 text-sm font-medium text-slate-400">— Scott</p>

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

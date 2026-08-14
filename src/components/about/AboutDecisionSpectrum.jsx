import { useEffect, useRef, useState } from "react";
import BowlIllustration from "../BowlIllustration";

const MODES = [
  { id: "browse", shortLabel: "Browse", railLabel: "You choose everything" },
  { id: "bowl", shortLabel: "Movie Bowl", railLabel: "You choose the pool" },
  { id: "recommend", shortLabel: "Recommendation", railLabel: "A system chooses" },
];

const BROWSE_TITLE_SETS = [
  ["The Grand Budapest Hotel", "Heat", "Past Lives", "Moneyball", "The Holdovers"],
  ["Mad Max: Fury Road", "Portrait of a Lady on Fire", "Zodiac", "The Iron Giant", "The Farewell"],
  ["No Country for Old Men", "Palm Springs", "Before Sunrise", "The Menu", "Michael Clayton"],
];

const SAMPLE_BOWL = [
  {
    id: "you",
    chipLabel: "You",
    pickLabel: "your picks",
    selectedSubject: "You were",
    moviePronoun: "your",
    movieCount: 47,
    titles: ["Moonlight", "The Nice Guys", "Knives Out"],
  },
  {
    id: "significant-other",
    chipLabel: "Significant other",
    pickLabel: "your significant other's picks",
    selectedSubject: "Your significant other was",
    moviePronoun: "their",
    movieCount: 28,
    titles: ["Arrival", "Spirited Away", "The Thing"],
  },
];

const RECOMMENDATIONS = [
  { title: "Blade Runner 2049", score: 96, taste: 92, mood: 84, popularity: 78 },
  { title: "Parasite", score: 94, taste: 88, mood: 91, popularity: 86 },
  { title: "Ex Machina", score: 91, taste: 85, mood: 80, popularity: 74 },
];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches)
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(query);
    if (!mediaQuery) return undefined;

    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener?.("change", updateMatch);

    return () => {
      mediaQuery.removeEventListener?.("change", updateMatch);
    };
  }, [query]);

  return matches;
}

function BrowseDemo() {
  const [setIndex, setSetIndex] = useState(0);
  const statuses = ["12 minutes browsing", "24 minutes browsing", "37 minutes browsing", "Still deciding…"];
  const status = statuses[Math.min(setIndex, statuses.length - 1)];
  const titles = BROWSE_TITLE_SETS[setIndex % BROWSE_TITLE_SETS.length];

  return (
    <article className="about-demo-card flex h-full flex-col">
      <div>
        <p className="eyebrow">You choose everything</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">Browse everything</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Every movie is still possible. Apparently, so is another half hour of browsing.
        </p>
      </div>

      <div className="about-browse-list mt-5 flex-1" aria-live="polite">
        <div className="space-y-2">
          {titles.map((title, index) => (
            <div
              key={title}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/55 px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-500"
              >
                {index + 1}
              </span>
              <span className="truncate text-sm text-slate-300">{title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setSetIndex((current) => current + 1)}
        >
          Keep browsing
        </button>
        <p className="mt-2 text-center text-xs font-medium text-slate-500">{status}</p>
      </div>
    </article>
  );
}

function pickFromSampleBowl(previousResult) {
  const contributorIndex = Math.floor(Math.random() * SAMPLE_BOWL.length);
  const contributor = SAMPLE_BOWL[contributorIndex];
  const titleIndex = Math.floor(Math.random() * contributor.titles.length);
  let title = contributor.titles[titleIndex];

  if (
    previousResult?.id === contributor.id &&
    previousResult?.title === title
  ) {
    title = contributor.titles[(titleIndex + 1) % contributor.titles.length];
  }

  return {
    id: contributor.id,
    chipLabel: contributor.chipLabel,
    pickLabel: contributor.pickLabel,
    selectedSubject: contributor.selectedSubject,
    moviePronoun: contributor.moviePronoun,
    title,
  };
}

function BowlDemo() {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingTitle, setDrawingTitle] = useState("");
  const [result, setResult] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const lastResultRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const drawMovie = () => {
    if (isDrawing) return;

    const nextResult = pickFromSampleBowl(lastResultRef.current);
    lastResultRef.current = nextResult;
    setResult(null);
    setDrawingTitle(nextResult.title);
    setIsDrawing(true);
    setAnnouncement("Drawing from the sample bowl.");

    timerRef.current = window.setTimeout(() => {
      setResult(nextResult);
      setIsDrawing(false);
      setAnnouncement(`${nextResult.title} was drawn from ${nextResult.pickLabel}.`);
    }, 1280);
  };

  const resetDemo = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    lastResultRef.current = null;
    setIsDrawing(false);
    setDrawingTitle("");
    setResult(null);
    setAnnouncement("Sample bowl reset.");
  };

  return (
    <article className="about-demo-card about-demo-card-featured flex h-full flex-col">
      <div>
        <p className="eyebrow text-rose-300">You choose the pool</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Draw from the bowl</h3>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          75 movies. Two people. Every option has someone rooting for it.
        </p>
      </div>

      <div className="mt-3 flex flex-1 flex-col justify-center">
        <BowlIllustration
          drawTitle={drawingTitle}
          isDrawing={isDrawing}
          className="mx-auto h-36 w-full max-w-sm sm:h-40"
        />

        <div className="mt-1 flex flex-wrap justify-center gap-1.5" aria-label="Sample contributors">
          {SAMPLE_BOWL.map((group) => (
            <span
              key={group.id}
              className="rounded-full border border-slate-700/80 bg-slate-950/65 px-2.5 py-1 text-xs text-slate-300"
            >
              {group.chipLabel} · {group.movieCount}
            </span>
          ))}
        </div>

        {result ? (
          <div className="about-paper-ticket mx-auto mt-4 w-full max-w-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-800/70">
              Tonight&apos;s draw
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{result.title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">From {result.pickLabel}</p>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs font-medium text-slate-400">75 movies · 2 bowl members</p>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={drawMovie}
          disabled={isDrawing}
        >
          {isDrawing ? "Drawing…" : result ? "Draw again" : "Draw tonight's movie"}
        </button>
        {result && (
          <>
            <p className="mt-3 text-center text-xs leading-5 text-slate-300">
              {result.selectedSubject} selected first, then one of {result.moviePronoun} movies. Each
              member had an equal chance — the method every bowl starts with. An owner can switch
              their bowl to draw title by title instead.
            </p>
            <button
              type="button"
              onClick={resetDemo}
              className="mx-auto mt-2 block rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-200"
            >
              Reset demo
            </button>
          </>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </article>
  );
}

function SignalBar({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <span
          aria-hidden="true"
          className="block h-full rounded-full bg-slate-500"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function RecommendationDemo() {
  const [recommendationIndex, setRecommendationIndex] = useState(0);
  const recommendation = RECOMMENDATIONS[recommendationIndex % RECOMMENDATIONS.length];

  return (
    <article className="about-demo-card flex h-full flex-col">
      <div>
        <p className="eyebrow">A system chooses</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-100">Get a recommendation</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Get a quick, confident answer from signals and preferences interpreted for you.
        </p>
      </div>

      <div
        className="mt-5 flex flex-1 flex-col justify-center rounded-2xl border border-slate-700/80 bg-slate-950/60 p-4"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Tonight&apos;s recommendation
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-100">{recommendation.title}</p>
          </div>
          <span className="shrink-0 rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
            {recommendation.score}% match
          </span>
        </div>

        <div className="mt-5 space-y-3">
          <SignalBar label="Taste" value={recommendation.taste} />
          <SignalBar label="Mood" value={recommendation.mood} />
          <SignalBar label="Popularity" value={recommendation.popularity} />
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          className="btn btn-secondary w-full"
          onClick={() => setRecommendationIndex((current) => current + 1)}
        >
          Recommend another
        </button>
        <p className="mt-2 text-center text-xs leading-5 text-slate-500">
          Fast and convenient—as long as you are comfortable letting the system define the shortlist.
        </p>
      </div>
    </article>
  );
}

function DemoForMode({ mode }) {
  if (mode === "browse") return <BrowseDemo />;
  if (mode === "recommend") return <RecommendationDemo />;
  return <BowlDemo />;
}

export default function AboutDecisionSpectrum() {
  const [activeMode, setActiveMode] = useState("bowl");
  const tabRefs = useRef([]);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const handleTabKeyDown = (event, currentIndex) => {
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % MODES.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + MODES.length) % MODES.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = MODES.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextMode = MODES[nextIndex];
    setActiveMode(nextMode.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section id="decision-demo" aria-labelledby="decision-demo-heading" className="scroll-mt-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow text-rose-300">The decision spectrum</p>
        <h2
          id="decision-demo-heading"
          className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl"
        >
          Three ways to choose
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-300">
          One approach can keep you browsing. Another can give you an answer immediately. Movie Bowl
          keeps you and the people you watch with in charge of the choices while making the final
          decision easy.
        </p>
      </div>

      {isDesktop ? (
        <div className="about-spectrum-rail mt-9" aria-hidden="true">
          {MODES.map((mode) => (
            <div key={mode.id} className="about-spectrum-stop">
              <span>{mode.railLabel}</span>
              <i />
            </div>
          ))}
        </div>
      ) : (
        <div
          role="tablist"
          aria-label="Ways to choose a movie"
          className="mx-auto mt-7 grid max-w-xl grid-cols-3 rounded-2xl border border-slate-700/80 bg-slate-950/60 p-1"
        >
          {MODES.map((mode, index) => (
            <button
              key={mode.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`about-${mode.id}-tab`}
              aria-controls={`about-${mode.id}-panel`}
              aria-selected={activeMode === mode.id}
              tabIndex={activeMode === mode.id ? 0 : -1}
              onClick={() => setActiveMode(mode.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`min-h-11 rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                activeMode === mode.id
                  ? "bg-rose-700 text-white shadow-lg shadow-rose-950/30"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              {mode.shortLabel}
            </button>
          ))}
        </div>
      )}

      <div className={`mt-5 ${isDesktop ? "grid grid-cols-[0.92fr_1.16fr_0.92fr] items-stretch gap-4" : ""}`}>
        {MODES.map((mode) => {
          const isActive = activeMode === mode.id;
          return (
            <div
              key={mode.id}
              id={`about-${mode.id}-panel`}
              role={isDesktop ? undefined : "tabpanel"}
              aria-labelledby={isDesktop ? undefined : `about-${mode.id}-tab`}
              hidden={!isDesktop && !isActive}
              className={isDesktop && mode.id === "bowl" ? "-my-2" : ""}
            >
              <DemoForMode mode={mode.id} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

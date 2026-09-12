import { useEffect, useRef, useState } from "react";
import BowlIllustration from "../BowlIllustration";

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

function pickFromSampleBowl(previousResult) {
  const contributorIndex = Math.floor(Math.random() * SAMPLE_BOWL.length);
  const contributor = SAMPLE_BOWL[contributorIndex];
  const titleIndex = Math.floor(Math.random() * contributor.titles.length);
  let title = contributor.titles[titleIndex];

  if (previousResult?.id === contributor.id && previousResult?.title === title) {
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

export default function AboutDrawDemo() {
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

  return (
    <article className="about-demo-card about-demo-card-featured flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-300">
          A sample bowl
        </h2>
        <span className="text-xs font-medium text-slate-400">75 movies · 2 members</span>
      </div>

      <div className="mt-2 flex flex-1 flex-col justify-center">
        <BowlIllustration
          drawTitle={drawingTitle}
          isDrawing={isDrawing}
          className="mx-auto h-36 w-full max-w-sm sm:h-44"
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
          <div className="about-paper-ticket mx-auto mt-5 w-full max-w-xs text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-800/70">
              Tonight&apos;s draw
            </p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-950">{result.title}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">From {result.pickLabel}</p>
          </div>
        ) : (
          <p className="mx-auto mt-5 max-w-xs text-center text-sm leading-6 text-slate-300">
            Every option has someone rooting for it. Press the button and one of them wins the night.
          </p>
        )}
      </div>

      <div className="mt-5">
        <button type="button" className="btn btn-primary w-full" onClick={drawMovie} disabled={isDrawing}>
          {isDrawing ? "Drawing…" : result ? "Draw again" : "Draw tonight's movie"}
        </button>
        {result && (
          <p className="mt-3 text-center text-xs leading-5 text-slate-300">
            {result.selectedSubject} selected first, then one of {result.moviePronoun} movies. Each
            member had an equal chance — the method every bowl starts with.
          </p>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </article>
  );
}

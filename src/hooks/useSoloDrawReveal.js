import { useCallback, useEffect, useRef, useState } from "react";
import { getDrawRevealTimeline } from "../utils/drawReveal";
import { getSoloDrawRevealPreview } from "../utils/soloDrawReveal";

const keepMovie = async (movie) => movie;

// Both solo screens wait on the same schedule. Persistence owns the pool and
// result; this hook only stages them and prepares details during the reveal.
export default function useSoloDrawReveal({ minimumMs = 1500 } = {}) {
  const [revealRun, setRevealRun] = useState(null);
  const runRef = useRef(null);
  useEffect(() => () => { runRef.current = null; }, []);

  const revealCommittedDraw = useCallback(async (drawAction, { originRect = null, prepareMovie = keepMovie } = {}) => {
    if (runRef.current) return null;
    const token = {};
    const startedAt = Date.now();
    const run = {
      startedAt, methodId: "solo", originRect,
      reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
      preview: null, previewAt: null, reveal: null, resultAt: null, title: "",
    };
    runRef.current = { token, run };
    setRevealRun(run);
    const update = (patch) => {
      if (runRef.current?.token !== token) return;
      runRef.current.run = { ...runRef.current.run, ...patch };
      setRevealRun(runRef.current.run);
    };
    const waitUntil = (at) => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, at - (Date.now() - startedAt))));

    try {
      const result = await drawAction({
        onPoolResolved: (pool) => update({ preview: getSoloDrawRevealPreview(pool), previewAt: Date.now() - startedAt }),
      });
      if (runRef.current?.token !== token) return null;
      if (!result) {
        await waitUntil(minimumMs);
        return null;
      }
      const { drawReveal: reveal = null, ...movie } = result;
      update({ reveal, resultAt: Date.now() - startedAt, title: movie.title || "" });
      const { openAt } = getDrawRevealTimeline(runRef.current.run);
      const [preparedMovie] = await Promise.all([
        prepareMovie(movie),
        waitUntil(Math.max(minimumMs, openAt ?? 0)),
      ]);
      return runRef.current?.token === token ? preparedMovie : null;
    } finally {
      if (runRef.current?.token === token) {
        runRef.current = null;
        setRevealRun(null);
      }
    }
  }, [minimumMs]);

  return { revealRun, isRevealing: Boolean(revealRun), revealCommittedDraw };
}

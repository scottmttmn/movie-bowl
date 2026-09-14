import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAutoplayTrailerUrl, loadYouTubeIframeApi } from "../lib/youtubePlayer";

const ANNOUNCEMENT_MS = 4200;
const FEATURE_CARD_MS = 3600;

// Long enough that an ordinary buffer is not mistaken for a refusal, short
// enough that nobody sits in front of a dead frame wondering.
const AUTOPLAY_GRACE_MS = 1200;

const PLAYING = 1;
const ENDED = 0;

/**
 * The pre-roll on a phone or a laptop.
 *
 * The television's version (`src/tv/components/TvTheaterPreroll.jsx`) ships no
 * controls at all, because a cinema has none and the remote's Back key carries
 * the exit. Neither holds here, so three things differ deliberately:
 *
 * - **The exit is visible.** A laptop has Escape, but a phone has neither that
 *   nor a Back this page can claim -- the Android gesture would navigate the
 *   route out from under the draw, and iOS offers nothing inside a modal. A
 *   room with no way out is worse than a button breaking the spell.
 * - **No native fullscreen.** The television asks for it to shed the WebView's
 *   chrome. A full-viewport overlay in a browser already covers everything a
 *   page can, and taking real fullscreen would hand Escape to the browser --
 *   which is the web's exit, and cannot be taken back with preventDefault.
 * - **Autoplay is checked, not assumed.** The draw press is a real gesture, but
 *   the queue resolves through TMDB lookups first, so by the time a player
 *   exists the browser may no longer count it. Rather than predict which
 *   browsers refuse, ask for playback and watch whether it starts.
 */
export default function TheaterPreroll({ queue, featureTitle, onFinish }) {
  const playerId = `theater-preroll-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const indexRef = useRef(0);
  const advanceRef = useRef(() => {});
  const finishRef = useRef(onFinish);
  const graceTimerRef = useRef(null);

  const [isPaused, setIsPaused] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [phase, setPhase] = useState("trailers");
  const [showAnnouncement, setShowAnnouncement] = useState(true);

  // The queue is fixed for the life of the overlay, so the iframe keeps one src
  // for the whole sequence and later previews arrive via loadVideoById.
  const firstTrailerUrl = useMemo(
    () => getAutoplayTrailerUrl(queue[0]?.trailer, { preroll: true, inline: true }),
    [queue]
  );

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const clearGrace = useCallback(() => {
    if (graceTimerRef.current) window.clearTimeout(graceTimerRef.current);
    graceTimerRef.current = null;
  }, []);

  // Armed after every play attempt. If PLAYING never arrives the browser has
  // refused the gesture, and the answer is to ask for one -- inside the
  // ceremony, over the card already saying what is about to play, rather than
  // as a dialog in front of it.
  const armAutoplayCheck = useCallback(() => {
    clearGrace();
    graceTimerRef.current = window.setTimeout(() => setNeedsTap(true), AUTOPLAY_GRACE_MS);
  }, [clearGrace]);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= queue.length) {
      setPhase("feature");
      return;
    }

    indexRef.current = next;
    setIsPaused(false);
    setShowAnnouncement(false);

    const nextKey = queue[next]?.trailer?.key;
    if (nextKey) {
      playerRef.current?.loadVideoById?.(String(nextKey));
      armAutoplayCheck();
    }
  }, [queue, armAutoplayCheck]);

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useLayoutEffect(() => {
    overlayRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        playerRef.current = new youtube.Player(playerId, {
          events: {
            onReady: (event) => {
              event.target.playVideo();
              armAutoplayCheck();
            },
            onStateChange: (event) => {
              if (event.data === PLAYING) {
                clearGrace();
                setNeedsTap(false);
                return;
              }
              if (event.data === ENDED) advanceRef.current();
            },
            // A pulled or region-blocked trailer gives way to the next one
            // rather than stalling on a dead frame.
            onError: () => advanceRef.current(),
          },
        });
      })
      .catch((error) => {
        console.error("[TheaterPreroll] Player API unavailable", error);
        if (!cancelled) finishRef.current();
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [playerId, armAutoplayCheck, clearGrace]);

  useEffect(() => clearGrace, [clearGrace]);

  useEffect(() => {
    if (!showAnnouncement) return undefined;
    const timer = window.setTimeout(() => setShowAnnouncement(false), ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [showAnnouncement]);

  useEffect(() => {
    if (phase !== "feature") return undefined;

    playerRef.current?.stopVideo?.();
    const timer = window.setTimeout(() => finishRef.current(), FEATURE_CARD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const startAfterRefusal = useCallback(() => {
    clearGrace();
    setNeedsTap(false);
    // Inside a real gesture handler, so this one cannot be refused.
    playerRef.current?.playVideo?.();
  }, [clearGrace]);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    setIsPaused((paused) => {
      if (paused) player.playVideo?.();
      else player.pauseVideo?.();
      return !paused;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishRef.current();
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        // A focused control already owns these keys. Claiming them here would
        // turn Enter on Exit into a pause, and the surface button reaches the
        // same handler through its own click anyway.
        if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) {
          return;
        }
        event.preventDefault();
        if (needsTap) startAfterRefusal();
        else togglePause();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePause, needsTap, startAfterRefusal]);

  const previewLabel = queue.length === 1 ? "One preview" : `${queue.length} previews`;

  return (
    <section
      ref={overlayRef}
      className="theater-preroll"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Previews before ${featureTitle}`}
    >
      <iframe
        id={playerId}
        src={firstTrailerUrl}
        title="Movie Bowl previews"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />

      {/* Covers the player so a click lands here rather than inside the iframe,
          where our handlers can never see it. */}
      {phase === "trailers" && (
        <button
          type="button"
          className="theater-preroll-surface"
          aria-label={needsTap ? "Start previews" : isPaused ? "Resume previews" : "Pause previews"}
          onClick={needsTap ? startAfterRefusal : togglePause}
        />
      )}

      {phase === "feature" ? (
        <div className="theater-preroll-card" role="status">
          <p className="eyebrow">And now</p>
          <h2 className="theater-preroll-title">Feature Presentation</h2>
          <p className="theater-preroll-feature">{featureTitle}</p>
        </div>
      ) : (
        <>
          {showAnnouncement && !needsTap && (
            <div className="theater-preroll-card" role="status">
              <p className="eyebrow">Before the feature</p>
              <h2 className="theater-preroll-title">{previewLabel}</h2>
              <p className="theater-preroll-feature">Then {featureTitle}</p>
            </div>
          )}

          {needsTap && (
            <div className="theater-preroll-card" role="status">
              <p className="eyebrow">Before the feature</p>
              <h2 className="theater-preroll-title">{previewLabel}</h2>
              <p className="theater-preroll-feature">Tap to start · then {featureTitle}</p>
            </div>
          )}

          {isPaused && !needsTap && (
            <p className="theater-preroll-paused" role="status">
              Paused
            </p>
          )}
        </>
      )}

      {/* An exit, not a skip. The television dropped its "Skip to movie" button
          because naming it invited the room to treat the previews as a queue to
          get through; the web cannot drop the control itself, so it drops the
          invitation instead -- a quiet corner glyph that says leave rather than
          advance. */}
      <button
        type="button"
        className="theater-preroll-exit"
        aria-label="Exit previews"
        onClick={() => finishRef.current()}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </section>
  );
}

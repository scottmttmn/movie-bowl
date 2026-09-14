import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getAutoplayTrailerUrl,
  getPlayerZoomStyle,
  getTrailerSequence,
  loadYouTubeIframeApi,
} from "../../lib/youtubePlayer";

const ANNOUNCEMENT_MS = 4200;
const FEATURE_CARD_MS = 3600;

const PLAYING = 1;

// If a preview is accepted but never starts, show the player rather than a
// black screen.
const MAX_COVER_MS = 4000;

export default function TvTheaterPreroll({ queue, featureTitle, onFinish }) {
  const playerId = `tv-preroll-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const iframeRef = useRef(null);
  const reclaimFocusRef = useRef(() => {});
  const playerRef = useRef(null);
  const indexRef = useRef(0);
  const attemptRef = useRef(0);
  const advanceRef = useRef(() => {});
  const refusedRef = useRef(() => {});
  const revealRef = useRef(() => {});
  const finishRef = useRef(onFinish);
  const coverTimerRef = useRef(null);

  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState("trailers");
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  // The embed paints YouTube's "unavailable" screen before the player can report
  // a refusal, and a refused fallback reports buffering before its error, so
  // each preview stays covered until it is actually playing.
  const [isCovered, setIsCovered] = useState(true);
  const [playerZoomStyle] = useState(getPlayerZoomStyle);

  // The queue is fixed for the life of the overlay, so the iframe keeps one
  // src for the whole sequence and later previews arrive via loadVideoById.
  const firstTrailerUrl = useMemo(
    () => getAutoplayTrailerUrl(queue[0]?.trailer, { preroll: true }),
    [queue]
  );

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const coverUntilPlaying = useCallback(() => {
    setIsCovered(true);
    window.clearTimeout(coverTimerRef.current);
    coverTimerRef.current = window.setTimeout(() => setIsCovered(false), MAX_COVER_MS);
  }, []);

  const reveal = useCallback(() => {
    window.clearTimeout(coverTimerRef.current);
    setIsCovered(false);
  }, []);

  // The cover starts up, so the first preview only needs its safety timer.
  useEffect(() => {
    coverTimerRef.current = window.setTimeout(() => setIsCovered(false), MAX_COVER_MS);
    return () => window.clearTimeout(coverTimerRef.current);
  }, []);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= queue.length) {
      setPhase("feature");
      return;
    }

    indexRef.current = next;
    attemptRef.current = 0;
    setIsPaused(false);
    setShowAnnouncement(false);

    const nextKey = queue[next]?.trailer?.key;
    if (nextKey) {
      coverUntilPlaying();
      playerRef.current?.loadVideoById?.(String(nextKey));
    }
  }, [queue, coverUntilPlaying]);

  // A refusal is about the video, not the title, so the same title's next-best
  // trailer gets a turn before the queue moves on without it.
  const playFallback = useCallback(() => {
    const sequence = getTrailerSequence(queue[indexRef.current]?.trailer);
    const next = attemptRef.current + 1;
    if (next >= sequence.length) {
      advance();
      return;
    }

    attemptRef.current = next;
    coverUntilPlaying();
    playerRef.current?.loadVideoById?.(sequence[next]);
  }, [queue, advance, coverUntilPlaying]);

  useEffect(() => {
    advanceRef.current = advance;
    refusedRef.current = playFallback;
    revealRef.current = reveal;
  }, [advance, playFallback, reveal]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // The reveal underneath is aria-hidden, but the navigation hook's Select
    // branch only checks for data-tv-focusable — so leaving focus on "Open
    // [service]" behind the overlay would let Enter launch a provider app
    // mid-preview. Holding focus on the overlay itself also means Select has
    // no default action to fight with.
    overlay.focus({ preventScroll: true });

    const requestFullscreen =
      overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (requestFullscreen) {
      Promise.resolve(requestFullscreen.call(overlay)).catch(() => {
        // The full-viewport overlay remains the fallback when native
        // fullscreen is unavailable or blocked by the television browser.
      });
    }
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
              reclaimFocusRef.current();
            },
            onStateChange: (event) => {
              reclaimFocusRef.current();
              if (event.data === PLAYING) revealRef.current();
              if (event.data === 0 || event.data === youtube.PlayerState?.ENDED) {
                advanceRef.current();
              }
            },
            // A pulled, age-restricted or unembeddable trailer silently gives
            // way rather than stalling the room on a dead frame.
            onError: () => refusedRef.current(),
          },
        });
      })
      .catch((error) => {
        console.error("[TvTheaterPreroll] Player API unavailable", error);
        if (!cancelled) finishRef.current();
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [playerId]);

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

  // The player takes focus when it starts and again on each loadVideoById, and
  // from inside the iframe our Select handler never sees the key. That is why
  // Back kept working while pause did not: Back is translated by the Android
  // shell above the page, so focus cannot swallow it. Take focus back whenever
  // the player claims it — the window blurs when an iframe does.
  const reclaimFocus = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (document.activeElement === iframeRef.current) {
      overlay.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    reclaimFocusRef.current = reclaimFocus;
    window.addEventListener("blur", reclaimFocus);
    return () => window.removeEventListener("blur", reclaimFocus);
  }, [reclaimFocus]);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    setIsPaused((paused) => {
      if (paused) player.playVideo?.();
      else player.pauseVideo?.();
      return !paused;
    });
  }, []);

  // A cinema has no controls to press, so the only gesture is the one every
  // video player already teaches: Select toggles playback. Nothing is drawn
  // until it is paused.
  //
  // This listens on window, not document, and the difference is the whole
  // feature. The Android shell consumes every key it maps and re-dispatches a
  // synthetic one with window.dispatchEvent, whose path is window alone — a
  // document listener never sees it, which is exactly how Select did nothing
  // on a television while the arrows and Back worked. useTvSpatialNavigation
  // has always listened on window for the same reason.
  useEffect(() => {
    const onKeyDown = (event) => {
      const isSelect =
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "MediaPlayPause" ||
        Number(event.keyCode) === 13;
      if (!isSelect) return;
      event.preventDefault();
      togglePause();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePause]);

  const previewLabel =
    queue.length === 1 ? "One preview" : `${queue.length} previews`;

  return (
    <section
      ref={overlayRef}
      className="tv-theater-overlay"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Previews before ${featureTitle}`}
    >
      <iframe
        ref={iframeRef}
        id={playerId}
        src={firstTrailerUrl}
        title="Movie Bowl previews"
        style={playerZoomStyle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />

      {/* Also drawn behind the feature card, where the stopped player would
          otherwise leave its last frame. */}
      {(isCovered || phase === "feature") && (
        <div className="tv-theater-cover" aria-hidden="true" />
      )}

      {phase === "feature" ? (
        <div className="tv-theater-feature" role="status">
          <p className="tv-kicker">And now</p>
          <h1>Feature Presentation</h1>
          <p className="tv-theater-feature-title">{featureTitle}</p>
        </div>
      ) : (
        <>
          {showAnnouncement && (
            <div className="tv-theater-announcement" role="status">
              <p className="tv-kicker">Before the feature</p>
              <h2>{previewLabel}</h2>
              <p>Then {featureTitle}</p>
            </div>
          )}

          {isPaused && (
            <p className="tv-theater-paused" role="status">
              Paused
            </p>
          )}
        </>
      )}
    </section>
  );
}

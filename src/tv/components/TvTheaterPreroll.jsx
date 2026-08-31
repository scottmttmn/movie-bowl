import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAutoplayTrailerUrl, loadYouTubeIframeApi } from "../utils/youtubePlayer";

const ANNOUNCEMENT_MS = 4200;
const FEATURE_CARD_MS = 3600;

export default function TvTheaterPreroll({ queue, featureTitle, onFinish }) {
  const playerId = `tv-preroll-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const iframeRef = useRef(null);
  const reclaimFocusRef = useRef(() => {});
  const playerRef = useRef(null);
  const indexRef = useRef(0);
  const advanceRef = useRef(() => {});
  const finishRef = useRef(onFinish);

  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState("trailers");
  const [showAnnouncement, setShowAnnouncement] = useState(true);

  // The queue is fixed for the life of the overlay, so the iframe keeps one
  // src for the whole sequence and later previews arrive via loadVideoById.
  const firstTrailerUrl = useMemo(
    () => getAutoplayTrailerUrl(queue[0]?.trailer, { preroll: true }),
    [queue]
  );

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

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
    if (nextKey) playerRef.current?.loadVideoById?.(String(nextKey));
  }, [queue]);

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

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
              if (event.data === 0 || event.data === youtube.PlayerState?.ENDED) {
                advanceRef.current();
              }
            },
            // A pulled or region-blocked trailer silently gives way to the
            // next one rather than stalling the room on a dead frame.
            onError: () => advanceRef.current(),
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

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />

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

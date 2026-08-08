import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAutoplayTrailerUrl, loadYouTubeIframeApi } from "../utils/youtubePlayer";

const ANNOUNCEMENT_MS = 4200;
const FEATURE_CARD_MS = 3600;

export default function TvTheaterPreroll({
  queue,
  featureTitle,
  onFinish,
  onExit,
}) {
  const playerId = `tv-preroll-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const indexRef = useRef(0);
  const advanceRef = useRef(() => {});
  const finishRef = useRef(onFinish);

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [phase, setPhase] = useState("trailers");
  const [showAnnouncement, setShowAnnouncement] = useState(true);

  // The queue is fixed for the life of the overlay, so the iframe keeps one
  // src for the whole sequence and later previews arrive via loadVideoById.
  const firstTrailerUrl = useMemo(
    () => getAutoplayTrailerUrl(queue[0]?.trailer),
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
    setIndex(next);
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
            onReady: (event) => event.target.playVideo(),
            onStateChange: (event) => {
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

  const togglePause = () => {
    const player = playerRef.current;
    if (!player) return;

    if (isPaused) {
      player.playVideo?.();
      setIsPaused(false);
      return;
    }

    player.pauseVideo?.();
    setIsPaused(true);
  };

  const currentTitle = queue[index]?.title || "";
  const previewLabel =
    queue.length === 1 ? "One preview" : `${queue.length} previews`;

  return (
    <section
      ref={overlayRef}
      className="tv-theater-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Previews before ${featureTitle}`}
    >
      <iframe
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

          <div className="tv-theater-chrome">
            <p className="tv-theater-progress">
              Preview {index + 1} of {queue.length}
              {currentTitle && ` · ${currentTitle}`}
            </p>
            <div className="tv-theater-controls">
              <button
                type="button"
                className="tv-theater-button"
                data-tv-focusable
                data-tv-nav-group="theater"
                data-tv-autofocus="true"
                onClick={togglePause}
              >
                {isPaused ? "Play" : "Pause"}
              </button>
              <button
                type="button"
                className="tv-theater-button"
                data-tv-focusable
                data-tv-nav-group="theater"
                onClick={advance}
              >
                Next preview
              </button>
              <button
                type="button"
                className="tv-theater-button"
                data-tv-focusable
                data-tv-nav-group="theater"
                onClick={onExit}
              >
                Skip to movie
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

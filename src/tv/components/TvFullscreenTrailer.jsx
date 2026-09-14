import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getAutoplayTrailerUrl,
  getTrailerSequence,
  loadYouTubeIframeApi,
} from "../../lib/youtubePlayer";

export default function TvFullscreenTrailer({ movieTitle, trailer, onClose }) {
  const playerId = `tv-trailer-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const enteredFullscreenRef = useRef(false);
  const closeRef = useRef(onClose);
  const sequence = useMemo(() => getTrailerSequence(trailer), [trailer]);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;

    const getFullscreenElement = () =>
      document.fullscreenElement || document.webkitFullscreenElement;
    const handleFullscreenChange = () => {
      if (getFullscreenElement() === overlay) {
        enteredFullscreenRef.current = true;
      } else if (enteredFullscreenRef.current) {
        enteredFullscreenRef.current = false;
        closeRef.current();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    const requestFullscreen =
      overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (requestFullscreen) {
      Promise.resolve(requestFullscreen.call(overlay)).catch(() => {
        // The full-viewport overlay remains the fallback when native fullscreen
        // is unavailable or blocked by the television browser.
      });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
    };
  }, []);

  useEffect(() => {
    if (sequence.length === 0) return undefined;

    let cancelled = false;
    let attempt = 0;

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        playerRef.current = new youtube.Player(playerId, {
          events: {
            onReady: (event) => event.target.playVideo(),
            onStateChange: (event) => {
              if (
                event.data === 0 ||
                event.data === youtube.PlayerState?.ENDED
              ) {
                closeRef.current();
              }
            },
            // YouTube refuses age-restricted and unembeddable trailers the
            // moment they load. The next-best trailer plays instead; once none
            // are left the overlay says so, because the "Watch on YouTube" link
            // under YouTube's own message leads nowhere inside the TV app.
            onError: () => {
              attempt += 1;
              if (attempt < sequence.length) {
                playerRef.current?.loadVideoById?.(sequence[attempt]);
              } else {
                setIsUnavailable(true);
              }
            },
          },
        });
      })
      .catch((error) => {
        console.error("[TvFullscreenTrailer] Player API unavailable", error);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [playerId, sequence]);

  return (
    <section
      ref={overlayRef}
      className="tv-trailer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${movieTitle} trailer`}
    >
      <iframe
        id={playerId}
        src={getAutoplayTrailerUrl(trailer)}
        title={`${movieTitle} trailer`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
      {isUnavailable && (
        <p className="tv-trailer-unavailable" role="status">
          Trailer unavailable
        </p>
      )}
      <button
        type="button"
        className="tv-trailer-close"
        data-tv-focusable
        data-tv-nav-group="trailer"
        data-tv-autofocus="true"
        onClick={onClose}
      >
        Close trailer
      </button>
    </section>
  );
}

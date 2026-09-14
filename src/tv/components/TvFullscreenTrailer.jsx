import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  getAutoplayTrailerUrl,
  getPlayerZoomStyle,
  getTrailerSequence,
  loadYouTubeIframeApi,
} from "../../lib/youtubePlayer";

// Only PLAYING proves a video was accepted. loadVideoById reports BUFFERING
// before YouTube decides, so a refused fallback buffers and then errors.
const PLAYING = 1;

// If a trailer is accepted but never starts -- autoplay held back, a stalled
// network -- show the player rather than a black screen.
const MAX_COVER_MS = 4000;

export default function TvFullscreenTrailer({ movieTitle, trailer, onClose }) {
  const playerId = `tv-trailer-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const enteredFullscreenRef = useRef(false);
  const closeRef = useRef(onClose);
  const sequence = useMemo(() => getTrailerSequence(trailer), [trailer]);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isCovered, setIsCovered] = useState(true);
  const [playerZoomStyle] = useState(getPlayerZoomStyle);

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
    let coverTimer = null;
    const reveal = () => {
      if (!cancelled) setIsCovered(false);
    };
    const coverUntilPlaying = () => {
      window.clearTimeout(coverTimer);
      coverTimer = window.setTimeout(reveal, MAX_COVER_MS);
    };
    coverUntilPlaying();

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        playerRef.current = new youtube.Player(playerId, {
          events: {
            onReady: (event) => event.target.playVideo(),
            onStateChange: (event) => {
              if (event.data === PLAYING) {
                window.clearTimeout(coverTimer);
                reveal();
              }
              if (
                event.data === 0 ||
                event.data === youtube.PlayerState?.ENDED
              ) {
                closeRef.current();
              }
            },
            // YouTube refuses age-restricted and unembeddable trailers the
            // moment they load, after the embed has already painted its
            // "unavailable" screen -- which is why the player starts covered.
            // The next-best trailer plays instead; once none are left the
            // overlay says so over the cover, because the "Watch on YouTube"
            // link under YouTube's own message leads nowhere inside the TV app.
            onError: () => {
              attempt += 1;
              setIsCovered(true);
              if (attempt < sequence.length) {
                coverUntilPlaying();
                playerRef.current?.loadVideoById?.(sequence[attempt]);
              } else {
                window.clearTimeout(coverTimer);
                setIsUnavailable(true);
              }
            },
          },
        });
      })
      .catch((error) => {
        console.error("[TvFullscreenTrailer] Player API unavailable", error);
        window.clearTimeout(coverTimer);
        reveal();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(coverTimer);
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
        style={playerZoomStyle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
      {isCovered && <div className="tv-trailer-cover" aria-hidden="true" />}
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

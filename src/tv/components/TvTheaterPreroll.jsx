import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getAutoplayTrailerUrl,
  getPlayerZoomStyle,
  getTrailerSequence,
  loadYouTubeIframeApi,
} from "../../lib/youtubePlayer";
import ServiceLogo from "../../components/ServiceLogo";
import { getHouseLightsTiming, prefersReducedMotion } from "../../utils/houseLights";

const ANNOUNCEMENT_MS = 4200;
const FEATURE_CARD_MS = 3600;

const PLAYING = 1;

// If a preview is accepted but never starts, show the player rather than a
// black screen.
const MAX_COVER_MS = 4000;

// A hand-off keeps the room dark while the provider app opens over Movie Bowl.
// The lights then come up behind it, or onto the reveal and its "isn't
// installed" message when the launch fails.
const HANDOFF_HOLD_MS = 1500;

// The longest the lights wait for native fullscreen to let go.
const FULLSCREEN_EXIT_WAIT_MS = 400;

// onFinish is every way out; onComplete is only the feature card running its
// course. They differ because the natural end may open the provider app, and an
// exit never should.
//
// The house lights (utils/houseLights.js) dim the pick on the way in and come
// up on it on the way out. Back reaches this through the screen's own handler,
// so the screen asks the ref to leave rather than unmounting the overlay.
export default function TvTheaterPreroll({
  ref,
  queue,
  featureTitle,
  featureServiceName = null,
  captions = false,
  handsOff = false,
  onFinish,
  onComplete = onFinish,
}) {
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
  const holdRef = useRef(() => {});
  const finishRef = useRef(onFinish);
  const completeRef = useRef(onComplete);
  const coverTimerRef = useRef(null);
  const handsOffRef = useRef(handsOff);
  const leaveTimerRef = useRef(null);
  const leavingRef = useRef(false);
  const fullscreenRequestedRef = useRef(false);
  const raiseIdRef = useRef(0);
  // The first preview is started under the announcement, so the browser counts
  // it as allowed to play, then held at its first frame until the card has gone:
  // letting it run put its opening under the card.
  const holdingRef = useRef(true);
  const heldRef = useRef(false);

  const [timing] = useState(() => getHouseLightsTiming(prefersReducedMotion()));
  // lowering -> down -> raising. Only "down" shows the screen.
  const [lights, setLights] = useState("lowering");
  const [raiseMs, setRaiseMs] = useState(timing.exit);

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
    () => getAutoplayTrailerUrl(queue[0]?.trailer, { preroll: true, captions }),
    [queue, captions]
  );

  useEffect(() => {
    finishRef.current = onFinish;
    completeRef.current = onComplete;
    handsOffRef.current = handsOff;
  }, [onFinish, onComplete, handsOff]);

  const coverUntilPlaying = useCallback(() => {
    setIsCovered(true);
    window.clearTimeout(coverTimerRef.current);
    coverTimerRef.current = window.setTimeout(() => setIsCovered(false), MAX_COVER_MS);
  }, []);

  const reveal = useCallback(() => {
    window.clearTimeout(coverTimerRef.current);
    setIsCovered(false);
    // The lights answer the projector: a preview playing ends the dimming.
    setLights((current) => (current === "lowering" ? "down" : current));
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
    // A first title that failed outright takes the announcement with it, so
    // the next preview must not wait for a card that will never end.
    holdingRef.current = false;
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

  // The card is gone, so the held preview starts from its first frame. One
  // that has not started yet simply plays when it does.
  const endAnnouncement = useCallback(() => {
    setShowAnnouncement(false);
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!heldRef.current || leavingRef.current) return;
    coverUntilPlaying();
    playerRef.current?.seekTo?.(0, true);
    playerRef.current?.playVideo?.();
  }, [coverUntilPlaying]);

  const hold = useCallback(() => {
    heldRef.current = true;
    playerRef.current?.pauseVideo?.();
    // Stays covered: the card is what the room should be reading.
    window.clearTimeout(coverTimerRef.current);
    setIsCovered(true);
    setLights((current) => (current === "lowering" ? "down" : current));
  }, []);

  useEffect(() => {
    advanceRef.current = advance;
    refusedRef.current = playFallback;
    revealRef.current = reveal;
    holdRef.current = hold;
  }, [advance, playFallback, reveal, hold]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // The reveal underneath is aria-hidden, but the navigation hook's Select
    // branch only checks for data-tv-focusable — so leaving focus on "Open
    // [service]" behind the overlay would let Enter launch a provider app
    // mid-preview. Holding focus on the overlay itself also means Select has
    // no default action to fight with.
    overlay.focus({ preventScroll: true });
  }, []);

  // Native fullscreen shows only the overlay, on black, so the room dims in the
  // page first and goes fullscreen once it is dark. Coming up, it leaves
  // fullscreen before the lights move, or they would rise over nothing.
  const isDark = lights === "down";
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!isDark || !overlay || fullscreenRequestedRef.current) return;
    fullscreenRequestedRef.current = true;

    const requestFullscreen =
      overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (requestFullscreen) {
      Promise.resolve(requestFullscreen.call(overlay)).catch(() => {
        // The full-viewport overlay remains the fallback when native
        // fullscreen is unavailable or blocked by the television browser.
      });
    }
  }, [isDark]);

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
              if (event.data === PLAYING) {
                if (holdingRef.current) holdRef.current();
                else revealRef.current();
              }
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
    const timer = window.setTimeout(
      () => setLights((current) => (current === "lowering" ? "down" : current)),
      timing.down
    );
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(leaveTimerRef.current);
    };
  }, [timing.down]);

  const raiseLights = useCallback((ms, then) => {
    leavingRef.current = true;
    playerRef.current?.pauseVideo?.();
    const raiseId = ++raiseIdRef.current;
    const start = () => {
      // A second Back may have ended the overlay while fullscreen let go.
      if (raiseId !== raiseIdRef.current) return;
      setRaiseMs(ms);
      setLights("raising");
      leaveTimerRef.current = window.setTimeout(then, ms);
    };

    // Fullscreen shows only the overlay, so fading it before fullscreen has
    // actually let go fades to black and then snaps to the page. Wait for it,
    // but not for long: a WebView that never settles still gets its lights.
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fullscreenElement || fullscreenElement !== overlayRef.current || !exitFullscreen) {
      start();
      return;
    }
    Promise.race([
      Promise.resolve(exitFullscreen.call(document)).catch(() => {}),
      new Promise((resolve) => window.setTimeout(resolve, FULLSCREEN_EXIT_WAIT_MS)),
    ]).then(start);
  }, []);

  // Every way out. A second Back while the lights come up skips the rest; one
  // during a hand-off's hold cuts the hold short.
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimerRef.current);
    if (leavingRef.current) {
      raiseIdRef.current += 1;
      finishRef.current();
      return true;
    }
    raiseLights(timing.exit, () => finishRef.current());
    return true;
  }, [raiseLights, timing.exit]);

  useImperativeHandle(ref, () => ({ leave }), [leave]);

  // The announcement's time starts when the room is dark enough to read it.
  useEffect(() => {
    if (!showAnnouncement || lights !== "down") return undefined;
    const timer = window.setTimeout(endAnnouncement, ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [showAnnouncement, lights, endAnnouncement]);

  useEffect(() => {
    if (phase !== "feature") return undefined;

    playerRef.current?.stopVideo?.();
    const timer = window.setTimeout(() => {
      if (leavingRef.current) return;
      if (!handsOffRef.current) {
        raiseLights(timing.up, () => completeRef.current());
        return;
      }
      completeRef.current();
      leaveTimerRef.current = window.setTimeout(
        () => raiseLights(timing.up, () => finishRef.current()),
        HANDOFF_HOLD_MS
      );
    }, FEATURE_CARD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, raiseLights, timing.up]);

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
    // Select during the announcement means start now, not pause.
    if (holdingRef.current) {
      endAnnouncement();
      return;
    }

    setIsPaused((paused) => {
      if (paused) player.playVideo?.();
      else player.pauseVideo?.();
      return !paused;
    });
  }, [endAnnouncement]);

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
      if (leavingRef.current) return;
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
      data-lights={lights}
      style={{ "--house-down-ms": `${timing.down}ms`, "--house-up-ms": `${raiseMs}ms` }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Previews before ${featureTitle}`}
    >
      <div className="tv-theater-house" aria-hidden="true" />
      <div className="tv-theater-stage">
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
            {featureServiceName && (
              <ServiceLogo service={featureServiceName} className="tv-theater-feature-logo" />
            )}
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
      </div>
    </section>
  );
}

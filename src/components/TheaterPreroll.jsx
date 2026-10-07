import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getAutoplayTrailerUrl, getTrailerSequence, loadYouTubeIframeApi } from "../lib/youtubePlayer";
import ServiceLogo from "./ServiceLogo";
import { getHouseLightsTiming, prefersReducedMotion } from "../utils/houseLights";

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
 *
 * Both rooms share the house lights (`utils/houseLights.js`): the page dims to
 * black on the way in and the lights come up on the pick on the way out. The
 * way in never delays a preview -- the first one playing, or the tap it needs,
 * ends it early -- and a hand-off never lifts them, so a desktop tab goes from a
 * dark room straight to the provider's page.
 */
export default function TheaterPreroll({
  queue,
  featureTitle,
  featureServiceName = null,
  captions = false,
  // The natural end leaves for the provider. The lights stay down for it, and
  // the page that replaces this one is what ends the overlay.
  handsOff = false,
  onFinish,
  // Only the feature card running its course. Escape and Exit stay on onFinish,
  // because the natural end may leave for the provider and an exit never should.
  onComplete = onFinish,
}) {
  const playerId = `theater-preroll-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const indexRef = useRef(0);
  const attemptRef = useRef(0);
  const advanceRef = useRef(() => {});
  const refusedRef = useRef(() => {});
  const finishRef = useRef(onFinish);
  const completeRef = useRef(onComplete);
  const handsOffRef = useRef(handsOff);
  const graceTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);
  const leavingRef = useRef(false);
  // The first preview is started under the announcement, so the browser counts
  // it as allowed to play, then held at its first frame until the card has gone:
  // starting it only once the card ends risks a refusal, and letting it run
  // put its opening under the card.
  const holdingRef = useRef(true);
  const heldRef = useRef(false);

  const [timing] = useState(() => getHouseLightsTiming(prefersReducedMotion()));
  // lowering -> down -> raising. Only "down" shows the screen.
  const [lights, setLights] = useState("lowering");
  const [raiseMs, setRaiseMs] = useState(timing.exit);

  const [isPaused, setIsPaused] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [phase, setPhase] = useState("trailers");
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  // The embed paints YouTube's "unavailable" screen before the player can report
  // a refusal, and a refused fallback reports buffering before its error, so
  // each preview stays covered until it is actually playing. If autoplay is
  // what holds it back, the tap-to-start card is drawn over the cover.
  const [isCovered, setIsCovered] = useState(true);

  // The queue is fixed for the life of the overlay, so the iframe keeps one src
  // for the whole sequence and later previews arrive via loadVideoById.
  const firstTrailerUrl = useMemo(
    () => getAutoplayTrailerUrl(queue[0]?.trailer, { preroll: true, inline: true, captions }),
    [queue, captions]
  );

  useEffect(() => {
    finishRef.current = onFinish;
    completeRef.current = onComplete;
    handsOffRef.current = handsOff;
  }, [onFinish, onComplete, handsOff]);

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
    graceTimerRef.current = window.setTimeout(() => {
      setNeedsTap(true);
      // The card asking for a tap has to be seen, so the room stops dimming.
      setLights((current) => (current === "lowering" ? "down" : current));
    }, AUTOPLAY_GRACE_MS);
  }, [clearGrace]);

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
      setIsCovered(true);
      playerRef.current?.loadVideoById?.(String(nextKey));
      armAutoplayCheck();
    }
  }, [queue, armAutoplayCheck]);

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
    setIsCovered(true);
    playerRef.current?.loadVideoById?.(sequence[next]);
    armAutoplayCheck();
  }, [queue, advance, armAutoplayCheck]);

  useEffect(() => {
    advanceRef.current = advance;
    refusedRef.current = playFallback;
  }, [advance, playFallback]);

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
                setLights((current) => (current === "lowering" ? "down" : current));
                if (holdingRef.current) {
                  heldRef.current = true;
                  playerRef.current?.pauseVideo?.();
                  return;
                }
                setIsCovered(false);
                return;
              }
              if (event.data === ENDED) advanceRef.current();
            },
            // A pulled, age-restricted or unembeddable trailer gives way
            // rather than stalling on a dead frame.
            onError: () => refusedRef.current(),
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
    setRaiseMs(ms);
    setLights("raising");
    leaveTimerRef.current = window.setTimeout(then, ms);
  }, []);

  // Every way out. Asking again while the lights come up skips the rest.
  const leave = useCallback(() => {
    if (leavingRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      finishRef.current();
      return;
    }
    raiseLights(timing.exit, () => finishRef.current());
  }, [raiseLights, timing.exit]);

  useEffect(() => {
    if (phase !== "feature") return undefined;

    playerRef.current?.stopVideo?.();
    const timer = window.setTimeout(() => {
      if (leavingRef.current) return;
      if (handsOffRef.current) completeRef.current();
      else raiseLights(timing.up, () => completeRef.current());
    }, FEATURE_CARD_MS);
    return () => window.clearTimeout(timer);
  }, [phase, raiseLights, timing.up]);

  // The card is gone, so the held preview starts from its first frame. One
  // that has not started yet simply plays when it does.
  const endAnnouncement = useCallback(() => {
    setShowAnnouncement(false);
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (!heldRef.current || leavingRef.current) return;
    playerRef.current?.seekTo?.(0, true);
    playerRef.current?.playVideo?.();
    armAutoplayCheck();
  }, [armAutoplayCheck]);

  // The announcement's time starts when the room is dark enough to read it.
  useEffect(() => {
    if (!showAnnouncement || lights !== "down") return undefined;
    const timer = window.setTimeout(endAnnouncement, ANNOUNCEMENT_MS);
    return () => window.clearTimeout(timer);
  }, [showAnnouncement, lights, endAnnouncement]);

  const startAfterRefusal = useCallback(() => {
    clearGrace();
    setNeedsTap(false);
    // The tap card already said what is about to play.
    holdingRef.current = false;
    setShowAnnouncement(false);
    // Inside a real gesture handler, so this one cannot be refused.
    playerRef.current?.playVideo?.();
  }, [clearGrace]);

  const togglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    // Pressing during the announcement means start now, not pause.
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

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        leave();
        return;
      }
      if (leavingRef.current) return;
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
  }, [togglePause, needsTap, startAfterRefusal, leave]);

  const previewLabel = queue.length === 1 ? "One preview" : `${queue.length} previews`;

  return (
    <section
      ref={overlayRef}
      className="theater-preroll"
      data-lights={lights}
      style={{ "--house-down-ms": `${timing.down}ms`, "--house-up-ms": `${raiseMs}ms` }}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Previews before ${featureTitle}`}
    >
      <div className="theater-preroll-house" aria-hidden="true" />
      <div className="theater-preroll-stage">
        <iframe
          id={playerId}
          src={firstTrailerUrl}
          title="Movie Bowl previews"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />

        {/* Also drawn behind the feature card, where the stopped player would
            otherwise leave its last frame. */}
        {(isCovered || phase === "feature") && (
          <div className="theater-preroll-cover" data-testid="preroll-cover" aria-hidden="true" />
        )}

        {/* Covers the player so a click lands here rather than inside the iframe,
            where our handlers can never see it. */}
        {phase === "trailers" && lights === "down" && (
          <button
            type="button"
            className="theater-preroll-surface"
            aria-label={needsTap ? "Start previews" : showAnnouncement ? "Play previews" : isPaused ? "Resume previews" : "Pause previews"}
            onClick={needsTap ? startAfterRefusal : togglePause}
          />
        )}

        {phase === "feature" ? (
          <div className="theater-preroll-card theater-preroll-card-feature" role="status">
            <p className="eyebrow">And now</p>
            <h2 className="theater-preroll-title">Feature Presentation</h2>
            <p className="theater-preroll-feature">{featureTitle}</p>
            {featureServiceName && (
              <ServiceLogo service={featureServiceName} className="theater-preroll-logo" />
            )}
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
      </div>

      {/* An exit, not a skip. The television dropped its "Skip to movie" button
          because naming it invited the room to treat the previews as a queue to
          get through; the web cannot drop the control itself, so it drops the
          invitation instead -- a quiet corner glyph that says leave rather than
          advance. */}
      <button
        type="button"
        className="theater-preroll-exit"
        aria-label="Exit previews"
        onClick={leave}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </section>
  );
}

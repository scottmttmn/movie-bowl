import { useEffect, useId, useMemo, useState } from "react";
import { getTrailerEmbedUrl, getTrailerSequence, loadYouTubeIframeApi } from "../lib/youtubePlayer";

const CUED = 5;

// A refusal arrives in the same tick as onReady or the cue, so a short wait is
// enough to know a video was accepted.
const REFUSAL_GRACE_MS = 300;

// If the player never answers at all, show whatever the embed has rather than
// holding a blank box.
const MAX_COVER_MS = 4000;

/**
 * The trailer someone chose to watch from a movie's details.
 *
 * YouTube refuses some trailers inside an embed -- age-restricted ones show a
 * sign-in wall, and some uploaders turn embedding off -- and reports it through
 * the player API as soon as the video loads. When that happens this cues the
 * next-best trailer rather than leaving the wall up. It cues rather than plays:
 * the original press opened the player, and the viewer still starts it.
 *
 * The embed paints YouTube's "unavailable" screen before the API can report
 * it, so the player stays covered until a video has been accepted. When every
 * candidate is refused the cover lifts on YouTube's own message, which on the
 * web carries a working "Watch on YouTube" link.
 */
export default function TrailerEmbed({ trailer, title, className = "" }) {
  const playerId = `trailer-embed-${useId().replace(/:/g, "")}`;
  const sequence = useMemo(() => getTrailerSequence(trailer), [trailer]);
  const src = useMemo(() => getTrailerEmbedUrl(trailer), [trailer]);
  const hasFallbacks = sequence.length > 1;
  const [isCovered, setIsCovered] = useState(hasFallbacks);

  useEffect(() => {
    // With nothing to fall back to there is no reason to load the player API.
    if (!hasFallbacks) return undefined;

    let cancelled = false;
    let player = null;
    let attempt = 0;
    let revealTimer = null;
    const reveal = () => {
      if (!cancelled) setIsCovered(false);
    };
    const revealUnlessRefused = () => {
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(reveal, REFUSAL_GRACE_MS);
    };
    const coverTimer = window.setTimeout(reveal, MAX_COVER_MS);

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        player = new youtube.Player(playerId, {
          events: {
            onReady: revealUnlessRefused,
            onStateChange: (event) => {
              if (event.data === CUED) revealUnlessRefused();
            },
            onError: () => {
              window.clearTimeout(revealTimer);
              attempt += 1;
              if (attempt >= sequence.length) {
                reveal();
                return;
              }
              setIsCovered(true);
              player?.cueVideoById?.(sequence[attempt]);
            },
          },
        });
      })
      .catch((error) => {
        // Without the API the first trailer still plays; only the fallback is lost.
        console.error("[TrailerEmbed] Player API unavailable", error);
        reveal();
      });

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      window.clearTimeout(coverTimer);
      player?.destroy?.();
    };
  }, [hasFallbacks, playerId, sequence]);

  return (
    <div className={`relative ${className}`}>
      <iframe
        id={playerId}
        src={src}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      {isCovered && <div className="absolute inset-0 bg-slate-950" data-testid="trailer-cover" aria-hidden="true" />}
    </div>
  );
}

import { useEffect, useId, useMemo } from "react";
import { getTrailerEmbedUrl, getTrailerSequence, loadYouTubeIframeApi } from "../lib/youtubePlayer";

/**
 * The trailer someone chose to watch from a movie's details.
 *
 * YouTube refuses some trailers inside an embed -- age-restricted ones show a
 * sign-in wall, and some uploaders turn embedding off -- and reports it through
 * the player API as soon as the video loads. When that happens this cues the
 * next-best trailer rather than leaving the wall up. It cues rather than plays:
 * the original press opened the player, and the viewer still starts it.
 *
 * When every candidate is refused, YouTube's own message stays on screen. On
 * the web that message carries a working "Watch on YouTube" link, which is the
 * right way out and needs nothing added here.
 */
export default function TrailerEmbed({ trailer, title, className = "" }) {
  const playerId = `trailer-embed-${useId().replace(/:/g, "")}`;
  const sequence = useMemo(() => getTrailerSequence(trailer), [trailer]);
  const src = useMemo(() => getTrailerEmbedUrl(trailer), [trailer]);

  useEffect(() => {
    // With nothing to fall back to there is no reason to load the player API.
    if (sequence.length < 2) return undefined;

    let cancelled = false;
    let player = null;
    let attempt = 0;

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        player = new youtube.Player(playerId, {
          events: {
            onError: () => {
              attempt += 1;
              if (attempt < sequence.length) player?.cueVideoById?.(sequence[attempt]);
            },
          },
        });
      })
      .catch((error) => {
        // Without the API the first trailer still plays; only the fallback is lost.
        console.error("[TrailerEmbed] Player API unavailable", error);
      });

    return () => {
      cancelled = true;
      player?.destroy?.();
    };
  }, [playerId, sequence]);

  return (
    <iframe
      id={playerId}
      src={src}
      title={title}
      className={className}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

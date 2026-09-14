let youtubeIframeApiPromise = null;

export function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReadyHandler === "function") {
        previousReadyHandler();
      }
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.addEventListener(
      "error",
      () => {
        youtubeIframeApiPromise = null;
        reject(new Error("YouTube player API failed to load."));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

export function getYouTubeVideoId(trailer) {
  if (trailer?.key) return String(trailer.key);
  const match = String(trailer?.embedUrl || "").match(/\/embed\/([^?&#/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

// YouTube sizes its stream to the player's box times devicePixelRatio, and it
// cannot see a zoom applied to the page around it. The TV shell lays pages out
// at 1920x1080 CSS pixels with a ratio of 2 and zooms them to 0.5, so a
// fullscreen player there believes it is on a 4K screen and climbs to 1440p --
// which the onn. Full HD device can only decode in software, and stalls on
// until YouTube backs down about fifteen seconds later. Laying the player out
// at the page's zoom and scaling it back up hands YouTube the screen's real
// size. Anywhere the page is not zoomed out this returns nothing.
export function getPlayerZoomStyle() {
  const scale = Number(window.visualViewport?.scale);
  if (!Number.isFinite(scale) || scale <= 0 || scale >= 1) return undefined;
  return { "--player-zoom": scale };
}

// The trailer first, then the ranked fallbacks `selectBestTrailer` attached, as
// the video ids a player should try in order when YouTube refuses one.
export function getTrailerSequence(trailer) {
  const fallbacks = Array.isArray(trailer?.fallbacks) ? trailer.fallbacks : [];
  const ids = [trailer, ...fallbacks].map(getYouTubeVideoId).filter(Boolean);
  return [...new Set(ids)];
}

// A trailer someone opens themselves: YouTube's controls and no autoplay, but
// with the player API enabled so a refused video can be swapped for the next.
export function getTrailerEmbedUrl(trailer) {
  const videoId = getYouTubeVideoId(trailer);
  if (!videoId) return trailer?.embedUrl || "";

  const url = new URL(`https://www.youtube.com/embed/${encodeURIComponent(videoId)}`);
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("origin", window.location.origin);
  return url.toString();
}

export function getAutoplayTrailerUrl(trailer, { preroll = false, inline = false } = {}) {
  const videoId = getYouTubeVideoId(trailer);
  if (!videoId) return trailer?.embedUrl || "";

  const url = new URL(
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
  );
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("rel", "0");
  // A television plays fullscreen and does not care, but iOS reads `0` as
  // permission to hand the video to its own fullscreen player. That ends the
  // trailer outside our overlay, and getting back in for the next one needs a
  // fresh gesture -- so an inline queue is broken by it, not merely relocated.
  url.searchParams.set("playsinline", inline ? "1" : "0");
  url.searchParams.set("origin", window.location.origin);

  // Removing our own controls does not stop the room skipping ahead: the embed
  // ships YouTube's, and with disablekb unset its keyboard shortcuts are live,
  // so on a television the D-pad seeks the trailer. Only the pre-roll wants
  // this — someone who chose "Watch trailer" on the reveal keeps the scrubber.
  if (preroll) {
    url.searchParams.set("controls", "0");
    url.searchParams.set("disablekb", "1");
    url.searchParams.set("fs", "0");
    url.searchParams.set("iv_load_policy", "3");
  }
  return url.toString();
}

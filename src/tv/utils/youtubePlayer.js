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

export function getAutoplayTrailerUrl(trailer, { preroll = false } = {}) {
  const videoId = getYouTubeVideoId(trailer);
  if (!videoId) return trailer?.embedUrl || "";

  const url = new URL(
    `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
  );
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("enablejsapi", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("playsinline", "0");
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

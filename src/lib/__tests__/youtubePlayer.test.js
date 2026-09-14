import { afterEach, describe, expect, it } from "vitest";

import { getPlayerZoomStyle, getTrailerEmbedUrl, getTrailerSequence } from "../youtubePlayer";

describe("getTrailerSequence", () => {
  it("lists the trailer and then its fallbacks, once each", () => {
    expect(
      getTrailerSequence({ key: "a", fallbacks: [{ key: "b" }, { key: "a" }, { embedUrl: "https://www.youtube.com/embed/c" }] })
    ).toEqual(["a", "b", "c"]);
  });

  it("handles a trailer without fallbacks, and no trailer at all", () => {
    expect(getTrailerSequence({ key: "a" })).toEqual(["a"]);
    expect(getTrailerSequence(null)).toEqual([]);
  });
});

describe("getPlayerZoomStyle", () => {
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");

  afterEach(() => {
    if (original) Object.defineProperty(window, "visualViewport", original);
    else delete window.visualViewport;
  });

  function zoomTo(scale) {
    Object.defineProperty(window, "visualViewport", { configurable: true, value: scale == null ? undefined : { scale } });
  }

  // The TV shell's 1920x1080 layout zoomed to 0.5: a full-screen player would
  // otherwise report itself to YouTube as 4K.
  it("hands the page's zoom to the player when the page is zoomed out", () => {
    zoomTo(0.5);
    expect(getPlayerZoomStyle()).toEqual({ "--player-zoom": 0.5 });
  });

  it("leaves the player alone on an unzoomed or zoomed-in page", () => {
    zoomTo(1);
    expect(getPlayerZoomStyle()).toBeUndefined();
    zoomTo(1.5);
    expect(getPlayerZoomStyle()).toBeUndefined();
  });

  it("leaves the player alone when the zoom cannot be read", () => {
    zoomTo(null);
    expect(getPlayerZoomStyle()).toBeUndefined();
    zoomTo(0);
    expect(getPlayerZoomStyle()).toBeUndefined();
    zoomTo(Number.NaN);
    expect(getPlayerZoomStyle()).toBeUndefined();
  });
});

describe("getTrailerEmbedUrl", () => {
  it("enables the player API for this origin without autoplaying", () => {
    const url = new URL(getTrailerEmbedUrl({ key: "abc123" }));

    expect(url.pathname).toBe("/embed/abc123");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    expect(url.searchParams.has("autoplay")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { getTrailerEmbedUrl, getTrailerSequence } from "../youtubePlayer";

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

describe("getTrailerEmbedUrl", () => {
  it("enables the player API for this origin without autoplaying", () => {
    const url = new URL(getTrailerEmbedUrl({ key: "abc123" }));

    expect(url.pathname).toBe("/embed/abc123");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
    expect(url.searchParams.get("origin")).toBe(window.location.origin);
    expect(url.searchParams.has("autoplay")).toBe(false);
  });
});

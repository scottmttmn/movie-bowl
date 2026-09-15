import { describe, expect, it } from "vitest";
import {
  AUTO_START_SURFACE,
  getAutoStartMode,
  getAutoStartSurface,
  resolvePreferredLaunchTarget,
  resolvePreferredWebLaunchCandidate,
} from "../webLaunch";

describe("resolvePreferredWebLaunchCandidate", () => {
  it("picks the highest-ranked matching provider with a known web mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix", "Hulu"],
      movieProviders: ["Hulu", "Netflix"],
      title: "Dune",
    });

    expect(result).toEqual({
      serviceName: "Netflix",
      url: "https://www.netflix.com/search?q=Dune",
    });
  });

  it("falls back to the next ranked matching service when top one has no mapping", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI", "Hulu"],
      movieProviders: ["MUBI", "Hulu"],
      title: "Parasite",
    });

    expect(result).toEqual({
      serviceName: "Hulu",
      url: "https://www.hulu.com/search?q=Parasite",
    });
  });

  it("sends Max a title-only search query", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Max"],
      movieProviders: ["Max"],
      title: "The Batman",
    });

    expect(result).toEqual({
      serviceName: "Max",
      url: "https://play.max.com/search?q=The%20Batman",
    });
  });

  it("returns null when no mapped provider match exists", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["MUBI"],
      movieProviders: ["MUBI"],
      title: "The Fall",
    });

    expect(result).toBeNull();
  });

  it("returns null when title is missing", () => {
    const result = resolvePreferredWebLaunchCandidate({
      userServices: ["Netflix"],
      movieProviders: ["Netflix"],
      title: "",
    });

    expect(result).toBeNull();
  });
});

describe("resolvePreferredLaunchTarget", () => {
  const options = { userServices: ["Netflix", "Hulu"], movieProviders: ["Hulu", "Netflix"], title: "Arrival" };
  const netflix = { service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123", androidUrl: "nflx://title/123" };
  it("prefers a title URL and carries optional native destinations", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [netflix] })).toEqual({
      serviceName: "Netflix", url: netflix.webUrl, linkType: "title", deepLinks: { ios: null, android: netflix.androidUrl },
    });
  });
  it.each(["rent", "buy", "tve"])("does not launch a %s source or switch service priority", (type) => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [
      { ...netflix, type }, { service: "Hulu", type: "sub", webUrl: "https://www.hulu.com/movie/arrival" },
    ] });
    expect(result).toMatchObject({ serviceName: "Netflix", linkType: "search", url: "https://www.netflix.com/search?q=Arrival" });
  });
  it("does not choose a lower-ranked service just because it has a link", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "Hulu" }] })).toMatchObject({ serviceName: "Netflix", linkType: "search" });
  });
  it("allows free sources and normalizes service names", () => {
    expect(resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, service: "netflix", type: "free" }] }).linkType).toBe("title");
  });
  it("preserves the old empty and unknown-service behavior", () => {
    expect(resolvePreferredLaunchTarget(options)).toMatchObject(resolvePreferredWebLaunchCandidate(options));
    expect(resolvePreferredLaunchTarget({ ...options, title: "" })).toBeNull();
    expect(resolvePreferredLaunchTarget({ ...options, movieProviders: ["Unknown"] })).toBeNull();
  });
  it("rejects executable URLs, falling back to the service's search", () => {
    const result = resolvePreferredLaunchTarget({ ...options, providerLinks: [{ ...netflix, webUrl: "javascript:alert(1)" }] });
    expect(result.linkType).toBe("search");
  });
});

describe("getAutoStartSurface", () => {
  it("recognises the Google TV app by its user agent tag", () => {
    expect(getAutoStartSurface({
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 MovieBowlTV/0.1 AndroidTV",
      hasFinePointer: false,
    })).toBe(AUTO_START_SURFACE.tvApp);
  });

  it("treats a fine primary pointer as a desktop and anything else as touch", () => {
    expect(getAutoStartSurface({ userAgent: "Mozilla/5.0 (Macintosh)", hasFinePointer: true }))
      .toBe(AUTO_START_SURFACE.desktop);
    expect(getAutoStartSurface({ userAgent: "Mozilla/5.0 (iPhone)", hasFinePointer: false }))
      .toBe(AUTO_START_SURFACE.touch);
    expect(getAutoStartSurface()).toBe(AUTO_START_SURFACE.touch);
  });
});

describe("getAutoStartMode", () => {
  const titleLink = { serviceName: "Max", url: "https://play.max.com/movie/abc", linkType: "title" };
  const searchLink = { serviceName: "Max", url: "https://play.max.com/search?q=Dune", linkType: "search" };

  it("opens a window in the TV app and navigates on a desktop", () => {
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.tvApp, launchCandidate: titleLink })).toBe("window");
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.desktop, launchCandidate: titleLink })).toBe("navigate");
  });

  it("never auto-starts on touch", () => {
    expect(getAutoStartMode({ surface: AUTO_START_SURFACE.touch, launchCandidate: titleLink })).toBeNull();
  });

  it("never auto-starts a search link or a missing candidate", () => {
    for (const surface of Object.values(AUTO_START_SURFACE)) {
      expect(getAutoStartMode({ surface, launchCandidate: searchLink })).toBeNull();
      expect(getAutoStartMode({ surface, launchCandidate: null })).toBeNull();
      expect(getAutoStartMode({ surface, launchCandidate: { ...titleLink, url: null } })).toBeNull();
    }
  });

  it("stands down once a launch has already failed", () => {
    expect(getAutoStartMode({
      surface: AUTO_START_SURFACE.tvApp,
      launchCandidate: titleLink,
      launchError: "Max isn't installed on this TV.",
    })).toBeNull();
  });
});
